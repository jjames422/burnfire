import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { query, withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { canAppointRegent, canAssignRank, isAllianceRank, permissionForRank } from "@/lib/command/member-policy";
import type { AllianceRank } from "@/lib/command/access";
import type { AllianceTitle } from "@/lib/api/types";
import { validTitleForRank } from "@/lib/identity";

export async function GET(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer("r4");
  if (response) return response;
  const search = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return jsonError("Choose a valid member page.");
  const members = await query(
    `select u.id, coalesce(p.in_game_name, 'Profile not completed') as in_game_name,
            p.id is not null as profile_complete, u.created_at as signed_up_at,
            case when $2 then u.email end as email,
            am.game_rank, am.alliance_title, coalesce(am.is_regent, false) as is_regent, am.verified_at,
            is_platform_admin(u.id) as is_site_admin,
            case when $2 then mr.requested_rank end as requested_rank,
            case when $2 then mr.requested_title end as requested_title,
            case when $2 then mr.status end as request_status,
            e.identity_status, e.game_identifier,
            e.assigned_officer, sponsor.in_game_name as sponsor_name,
            (select count(*)::int from academy_enrollments r where r.assigned_officer = p.id) as assigned_recruits,
            (select count(*)::int from command_followups f where f.assigned_to = p.id and f.status <> 'resolved') as open_followups
     from users u left join profiles p on p.id = u.id
     left join alliance_members am on am.user_id = u.id
     left join academy_enrollments e on e.user_id = u.id
     left join membership_requests mr on mr.user_id = u.id
     left join profiles sponsor on sponsor.id = e.assigned_officer
     where ($2 or am.alliance = 'burnfire' or (am.user_id is null and e.user_id is not null))
       and ($1 = '' or coalesce(p.in_game_name, 'Profile not completed') ilike '%' || $1 || '%'
            or ($2 and u.email ilike '%' || $1 || '%'))
     order by (mr.status = 'pending') desc nulls last, u.created_at desc, u.id
     limit 101 offset $3`,
    [search, officer.is_site_admin, (page - 1) * 100],
  );
  const history = await query(
    `select h.id, p.in_game_name as member_name, actor.in_game_name as actor_name,
            h.previous_rank, h.new_rank, h.previous_title, h.new_title,
            h.previous_regent, h.new_regent, h.created_at
     from membership_history h
     join profiles p on p.id = h.user_id
     left join profiles actor on actor.id = h.changed_by
     order by h.created_at desc limit 30`,
  );
  return NextResponse.json({
    members: members.slice(0, 100), history, page, has_more: members.length > 100,
    actor: { id: user.id, game_rank: officer.game_rank, is_site_admin: officer.is_site_admin, is_regent: officer.is_regent },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer("r4");
  if (response) return response;
  const body = await request.json().catch(() => null);
  const id = typeof body?.user_id === "string" ? body.user_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !isAllianceRank(body?.game_rank)) {
    return jsonError("Choose a member and valid alliance rank.");
  }
  const rank = body.game_rank;
  const titleProvided = Object.hasOwn(body, "alliance_title");
  const regentProvided = Object.hasOwn(body, "is_regent");
  if (regentProvided && typeof body.is_regent !== "boolean") return jsonError("Choose a valid title for this rank.");
  const title = rank === "r5" ? "alliance_leader" : body.alliance_title ?? null;
  if (!validTitleForRank(rank, title)) return jsonError("Choose a valid title for this rank.");
  const result = await withTransaction(async (client) => {
    await client.query("LOCK TABLE alliance_members IN SHARE ROW EXCLUSIVE MODE");
    const actorResult = await client.query<{ game_rank: AllianceRank | null; is_regent: boolean; is_site_admin: boolean }>(
      `select am.game_rank, coalesce(am.is_regent, false) as is_regent, is_platform_admin(p.id) as is_site_admin
       from profiles p left join alliance_members am on am.user_id = p.id
         and am.alliance = 'burnfire' and am.verified_at is not null
       where p.id = $1`, [user.id],
    );
    const actor = actorResult.rows[0];
    if (!actor) return { error: "You do not have permission to access this area.", status: 403 };
    const target = await client.query<{ game_rank: AllianceRank | null; alliance: string | null; site_admin: boolean; alliance_title: AllianceTitle | null; is_regent: boolean }>(
      `select am.game_rank, am.alliance, am.alliance_title, coalesce(am.is_regent, false) as is_regent, is_platform_admin(p.id) as site_admin
       from profiles p left join alliance_members am on am.user_id = p.id
       where p.id = $1 for update of p`, [id],
    );
    const member = target.rows[0];
    if (!member) return { error: "Member not found.", status: 404 };
    const approval = await client.query("select 1 from membership_requests where user_id = $1 and status = 'pending' for update", [id]);
    if (approval.rowCount && !actor.is_site_admin) return { error: "A site administrator must review this membership request.", status: 403 };
    if (member.alliance && member.alliance !== "burnfire") return { error: "Member belongs to another alliance.", status: 409 };
    if ((!actor.is_site_admin && member.site_admin) ||
        !canAssignRank(actor.game_rank, actor.is_site_admin, member.game_rank, rank, actor.is_regent)) {
      return { error: "You may only manage ranks below your own. Site administrators manage leadership appointments.", status: 403 };
    }
    if (rank === "r5") {
      const leader = await client.query("select 1 from alliance_members where alliance = 'burnfire' and game_rank = 'r5' and user_id <> $1", [id]);
      if (leader.rowCount) return { error: "An alliance leader already exists. Change that appointment first.", status: 409 };
    }
    const approvedTitle = !titleProvided && rank === "r4" && member.game_rank === "r4" ? member.alliance_title : title;
    const approvedRegent = regentProvided ? body.is_regent : rank === "r4" && member.is_regent;
    if (!validTitleForRank(rank, approvedTitle) || (approvedRegent && (rank !== "r4" || !approvedTitle))) {
      return { error: "Choose a valid title for this rank.", status: 400 };
    }
    if (member.is_regent !== approvedRegent && !canAppointRegent(actor.game_rank, actor.is_site_admin)) {
      return { error: "Only the Alliance Leader or a site administrator can change Regent.", status: 403 };
    }
    if (approvedTitle) {
      const holder = await client.query(
        "select 1 from alliance_members where alliance = 'burnfire' and alliance_title = $1 and user_id <> $2",
        [approvedTitle, id],
      );
      if (holder.rowCount) return { error: "This title is already assigned. Remove that appointment first.", status: 409 };
    }
    if (approvedRegent) {
      const regent = await client.query(
        "select 1 from alliance_members where alliance = 'burnfire' and is_regent and user_id <> $1", [id],
      );
      if (regent.rowCount) return { error: "This title is already assigned. Remove that appointment first.", status: 409 };
    }
    await client.query(
      `insert into alliance_members (alliance, user_id, permission_role, game_rank, alliance_title, is_regent, verified_at, verified_by)
       values ('burnfire', $1, $2, $3::game_rank, $5::alliance_title, $6, now(), $4)
       on conflict (user_id) do update set permission_role = excluded.permission_role,
         game_rank = excluded.game_rank,
         alliance_title = excluded.alliance_title,
         is_regent = excluded.is_regent,
         verified_at = now(), verified_by = $4`,
      [id, permissionForRank(rank), rank, user.id, approvedTitle, approvedRegent],
    );
    await client.query(
      `insert into academy_enrollments (user_id, identity_status, identity_verified_by, identity_verified_at)
       values ($1, 'verified', $2, now())
       on conflict (user_id) do update set identity_status = 'verified',
         identity_verified_by = $2, identity_verified_at = now()`, [id, user.id],
    );
    await client.query(
      `insert into membership_history
         (user_id, changed_by, previous_rank, new_rank, previous_title, new_title, previous_regent, new_regent)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, user.id, member.game_rank, rank, member.alliance_title, approvedTitle, member.is_regent, approvedRegent],
    );
    await client.query(
      `update membership_requests set status = 'approved', reviewed_by = $2, reviewed_at = now(),
         approved_rank = $3, approved_title = $4
       where user_id = $1 and status = 'pending'`,
      [id, user.id, rank, approvedTitle],
    );
    return { updated: true };
  });
  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
