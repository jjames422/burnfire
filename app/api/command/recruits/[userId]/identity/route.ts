import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonError("Recruit was not found.", 404);
  }
  const body = await request.json().catch(() => null);
  if (typeof body?.verified !== "boolean") {
    return jsonError("Choose whether the recruit's game identity is verified.");
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 1000) return jsonError("Verification note is too long.");

  const result = await withTransaction(async (client) => {
    const enrollmentResult = await client.query<{
      identity_status: string;
      game_identifier: string | null;
      game_rank: string;
    }>(
      `select e.identity_status, e.game_identifier, am.game_rank
       from academy_enrollments e
       join alliance_members am on am.user_id = e.user_id and am.alliance = 'burnfire'
       where e.user_id = $1 and ($2::uuid is null or e.assigned_officer = $2) for update of e`,
      [userId, trainingScope(officer, user.id)],
    );
    const enrollment = enrollmentResult.rows[0];
    if (!enrollment) return { error: "Recruit was not found.", status: 404 };
    if (!officer.is_site_admin && (
      (officer.game_rank === "r3" && ["r3", "r4", "r5"].includes(enrollment.game_rank)) ||
      (officer.game_rank === "r4" && enrollment.game_rank === "r5")
    )) {
      return {
        error: "This officer rank cannot change identity verification for an equal-or-higher-rank member.",
        status: 403,
      };
    }
    if (body.verified && !enrollment.game_identifier) {
      return {
        error: "The recruit must submit a game identifier before verification.",
        status: 409,
      };
    }

    const nextStatus = body.verified ? "verified" : "pending";
    await client.query(
      `update academy_enrollments set identity_status = $2,
         identity_verified_by = case when $2 = 'verified' then $3::uuid else null end,
         identity_verified_at = case when $2 = 'verified' then now() else null end
       where user_id = $1`,
      [userId, nextStatus, user.id],
    );
    await client.query(
      `update alliance_members set verified_at = case when $2 = 'verified' then now() else null end,
         verified_by = case when $2 = 'verified' then $3::uuid else null end
       where user_id = $1 and alliance = 'burnfire'`,
      [userId, nextStatus, user.id],
    );
    if (enrollment.identity_status !== nextStatus || note) {
      await client.query(
        `insert into academy_identity_history
           (user_id, changed_by, previous_status, new_status, note)
         values ($1, $2, $3, $4, nullif($5, ''))`,
        [userId, user.id, enrollment.identity_status, nextStatus, note],
      );
    }
    return { identity_status: nextStatus };
  });

  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
