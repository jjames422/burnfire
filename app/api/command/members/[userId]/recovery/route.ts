import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { query, queryOne, withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { isRecoveryAction } from "@/lib/command/recovery";
import { resolveFollowup } from "@/lib/server/followups";

type RouteContext = { params: Promise<{ userId: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { officer, response } = await requireCommandOfficer();
  if (response) return response;
  if (!officer.is_site_admin) return jsonError("Only site administrators can manage account recovery.", 403);
  const { userId } = await params;
  if (!UUID.test(userId)) return jsonError("User not found.", 404);
  const user = await queryOne(
    `select u.id, u.email, coalesce(p.in_game_name, 'Profile not completed') as in_game_name,
            e.user_id is not null as enrolled, e.identity_status, am.game_rank,
            (select count(*)::int from sessions where user_id = u.id and expires_at > now()) as sessions,
            (select count(*)::int from passkeys where user_id = u.id) as passkeys,
            (select count(*)::int from academy_quiz_attempts where user_id = u.id) as quiz_attempts,
            (select count(*)::int from academy_acknowledgments where user_id = u.id) as acknowledgments
     from users u left join profiles p on p.id = u.id
     left join academy_enrollments e on e.user_id = u.id
     left join alliance_members am on am.user_id = u.id
     where u.id = $1`, [userId],
  );
  if (!user) return jsonError("User not found.", 404);
  const [followups, history] = await Promise.all([
    query(
      `select f.id, f.reason, f.status, c.title as training_title
       from command_followups f left join academy_content c on c.id = f.content_id
       where f.user_id = $1 and f.status <> 'resolved' order by f.created_at, f.id`, [userId],
    ),
    query(
      `select h.id::text, h.action, h.reason, h.created_at,
              coalesce(p.in_game_name, u.email) as actor_name
       from user_recovery_history h left join users u on u.id = h.actor_id
       left join profiles p on p.id = h.actor_id
       where h.user_id = $1 order by h.created_at desc, h.id desc limit 20`, [userId],
    ),
  ]);
  return NextResponse.json({ user, followups, history }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { user: actor, officer, response } = await requireCommandOfficer();
  if (response) return response;
  if (!officer.is_site_admin) return jsonError("Only site administrators can manage account recovery.", 403);
  const { userId } = await params;
  if (!UUID.test(userId)) return jsonError("User not found.", 404);
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!isRecoveryAction(action) || body?.confirmed !== true || reason.length < 3 || reason.length > 1000) {
    return jsonError("Select an action, confirm it, and enter a reason (3-1000 characters).");
  }
  const followupIds: string[] = [];
  if (action === "resolve_followups") {
    if (!Array.isArray(body.followup_ids) || body.followup_ids.length < 1 || body.followup_ids.length > 100) {
      return jsonError("Select between 1 and 100 open issues.");
    }
    for (const id of body.followup_ids) {
      if (typeof id !== "string" || !UUID.test(id)) return jsonError("Select valid follow-up issues.");
      followupIds.push(id.toLowerCase());
    }
    if (new Set(followupIds).size !== followupIds.length) return jsonError("Select each issue only once.");
    followupIds.sort();
  }

  const result = await withTransaction(async (client) => {
    const target = await client.query("select id from users where id = $1 for update", [userId]);
    if (!target.rowCount) return { error: "User not found.", status: 404 };
    const details: Record<string, number | string[]> = {};
    let previousIdentity = "pending";
    if (action === "academy_reset" || action === "reset_identity") {
      const enrollment = await client.query<{ identity_status: string }>(
        "select identity_status from academy_enrollments where user_id = $1 for update", [userId],
      );
      if (!enrollment.rowCount) return { error: "This user is not enrolled in the academy.", status: 409 };
      previousIdentity = enrollment.rows[0].identity_status;
    }
    if (action === "academy_reset") {
      const attempts = await client.query("delete from academy_quiz_attempts where user_id = $1", [userId]);
      const acknowledgments = await client.query("delete from academy_acknowledgments where user_id = $1", [userId]);
      const progress = await client.query("delete from academy_progress where user_id = $1", [userId]);
      await client.query("update academy_enrollments set current_step = 0, completed_at = null where user_id = $1", [userId]);
      details.quiz_attempts = attempts.rowCount ?? 0;
      details.acknowledgments = acknowledgments.rowCount ?? 0;
      details.progress = progress.rowCount ?? 0;
    } else if (action === "resolve_followups") {
      const selected = await client.query(
        `select id from command_followups
         where user_id = $1 and id = any($2::uuid[]) and status <> 'resolved'
         order by id for update`, [userId, followupIds],
      );
      if (selected.rowCount !== followupIds.length) {
        return { error: "One or more selected issues are no longer open or do not belong to this user. Reload and select again.", status: 409 };
      }
      for (const id of followupIds) await resolveFollowup(client, id, actor.id);
      details.followup_ids = followupIds;
    } else if (action === "revoke_sessions") {
      await client.query(
        `delete from auth_challenges where user_id = $1 or session_hash in
           (select token_hash from sessions where user_id = $1)`, [userId],
      );
      const removed = await client.query("delete from sessions where user_id = $1", [userId]);
      details.sessions = removed.rowCount ?? 0;
    } else if (action === "remove_passkeys") {
      await client.query("delete from auth_challenges where user_id = $1 and purpose = 'registration'", [userId]);
      const removed = await client.query("delete from passkeys where user_id = $1", [userId]);
      details.passkeys = removed.rowCount ?? 0;
    } else if (action === "reset_identity") {
      await client.query(
        `update academy_enrollments set identity_status = 'pending',
           identity_verified_by = null, identity_verified_at = null where user_id = $1`, [userId],
      );
      await client.query(
        "update alliance_members set verified_at = null, verified_by = null where user_id = $1 and alliance = 'burnfire'", [userId],
      );
      await client.query(
        `insert into academy_identity_history (user_id, changed_by, previous_status, new_status, note)
         values ($1, $2, $3, 'pending', $4)`, [userId, actor.id, previousIdentity, reason],
      );
    }
    await client.query(
      `insert into user_recovery_history (user_id, actor_id, action, reason, details)
       values ($1, $2, $3, $4, $5)`, [userId, actor.id, action, reason, JSON.stringify(details)],
    );
    return { saved: true, signed_out: action === "revoke_sessions" && actor.id === userId, details };
  });
  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
