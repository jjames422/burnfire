import { NextResponse, type NextRequest } from "next/server";
import { canManageLeadership, requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query, queryOne } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

const SORT_COLUMNS: Record<string, string> = {
  name: "p.in_game_name",
  started: "e.started_at",
  activity: "last_activity",
  identity: "e.identity_status",
};

export async function GET(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;

  const search = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const sort = request.nextUrl.searchParams.get("sort") ?? "started";
  const direction = request.nextUrl.searchParams.get("direction") === "asc" ? "asc" : "desc";
  if (search.length > 100 || !Number.isInteger(page) || page < 1 || page > 10000) {
    return jsonError("Invalid recruit search or page.");
  }
  if (!(sort in SORT_COLUMNS)) return jsonError("Invalid recruit sort.");
  const leadership = canManageLeadership(officer);
  // R3 trainers are always limited to their own recruits; leadership may filter by officer.
  const officerFilter = request.nextUrl.searchParams.get("officer") ?? "all";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!["all", "unassigned", "me"].includes(officerFilter) && !uuidPattern.test(officerFilter)) {
    return jsonError("Invalid recruit search or page.");
  }
  const scope = leadership
    ? officerFilter === "me" ? user.id : uuidPattern.test(officerFilter) ? officerFilter : null
    : trainingScope(officer, user.id);
  const unassignedOnly = leadership && officerFilter === "unassigned";

  const searchPattern = `%${search}%`;
  const whereSql = `where ($1::uuid is null or e.assigned_officer = $1)
    and (not $3::boolean or e.assigned_officer is null)
    and (p.in_game_name ilike $2 or e.game_identifier ilike $2)`;
  const params: unknown[] = [scope, searchPattern, unassignedOnly];
  const offset = (page - 1) * 30;
  const orderColumn = SORT_COLUMNS[sort];

  const [total, recruits, officers] = await Promise.all([
    queryOne<{ total: string }>(
      `select count(*)::text as total
       from academy_enrollments e
       join profiles p on p.id = e.user_id
       ${whereSql}`,
      params,
    ),
    query(
      `select e.user_id, p.in_game_name,
              e.game_identifier, e.communication_preference, e.identity_status,
              e.started_at, e.completed_at, e.current_step, e.officer_interest,
              e.assigned_officer, assigned.in_game_name as assigned_officer_name,
              i.opened_at as invitation_opened_at,
              coalesce(ack.acknowledged, 0)::int as required_acknowledgments,
              coalesce(required.total, 0)::int as required_total,
              latest.passed as latest_quiz_passed,
              coalesce(tasks.open_count, 0)::int as open_followups,
              greatest(
                e.started_at,
                coalesce(activity.last_progress, e.started_at),
                coalesce(activity.last_quiz, e.started_at),
                coalesce(activity.last_ack, e.started_at)
              ) as last_activity
       from academy_enrollments e
       join profiles p on p.id = e.user_id
       join users u on u.id = e.user_id
       left join command_invitations i on i.id = e.invitation_id
       left join profiles assigned on assigned.id = e.assigned_officer
       left join lateral (
         select count(*) as acknowledged
         from academy_content c
         join academy_acknowledgments a on a.content_id = c.id and a.user_id = e.user_id
         where c.status = 'published' and c.required
           and c.content_type in ('rule', 'module')
       ) ack on true
       left join lateral (
         select count(*) as total from academy_content c
         where c.status = 'published' and c.required
           and c.content_type in ('rule', 'module')
       ) required on true
       left join lateral (
         select passed from academy_quiz_attempts q
         where q.user_id = e.user_id order by q.created_at desc limit 1
       ) latest on true
       left join lateral (
         select count(*) as open_count from command_followups f
         where f.user_id = e.user_id and f.status <> 'resolved'
       ) tasks on true
       left join lateral (
         select max(p.updated_at) as last_progress,
                (select max(q.created_at) from academy_quiz_attempts q where q.user_id = e.user_id) as last_quiz,
                (select max(a.acknowledged_at) from academy_acknowledgments a where a.user_id = e.user_id) as last_ack
         from academy_progress p where p.user_id = e.user_id
       ) activity on true
       ${whereSql}
       group by e.user_id, p.in_game_name, e.game_identifier,
                e.communication_preference, e.identity_status, e.started_at,
                e.completed_at, e.current_step, e.officer_interest, e.assigned_officer,
                assigned.in_game_name, i.opened_at, ack.acknowledged, required.total,
                latest.passed, tasks.open_count, activity.last_progress,
                activity.last_quiz, activity.last_ack
       order by ${orderColumn} ${direction}, p.in_game_name asc
       limit 30 offset $${params.length + 1}`,
      [...params, offset],
    ),
    leadership
      ? query(
        `select p.id, p.in_game_name, am.game_rank,
                (select count(*)::int from academy_enrollments x where x.assigned_officer = p.id) as assigned_count
         from alliance_members am join profiles p on p.id = am.user_id
         where am.alliance = 'burnfire' and am.verified_at is not null
           and am.game_rank in ('r3', 'r4', 'r5')
         order by am.game_rank, p.in_game_name`,
      )
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    recruits,
    total: Number(total?.total ?? 0),
    page,
    page_size: 30,
    has_more: offset + recruits.length < Number(total?.total ?? 0),
    can_assign: leadership,
    officers,
  });
}
