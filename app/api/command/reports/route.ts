import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query } from "@/lib/server/db";

type ExportRow = Record<string, string | number | boolean | null>;

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const scope = trainingScope(officer, user.id);

  const format = request.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const rows = await query<ExportRow>(
      `select p.in_game_name,
              coalesce(e.communication_preference, 'not selected') as communication_preference,
              e.identity_status,
              case when e.completed_at is null then 'in progress' else 'completed' end as onboarding_status,
              coalesce(ack.acknowledged, 0)::int as required_acknowledgments,
              coalesce(required.total, 0)::int as required_total,
              coalesce(latest.failed, 0)::int as failed_latest_checks,
              coalesce(tasks.open_count, 0)::int as open_followups,
              coalesce(e.officer_interest, 'not stated') as officer_interest
       from academy_enrollments e
       join profiles p on p.id = e.user_id
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
         select count(*) filter (where not latest.passed) as failed
         from (
           select distinct on (content_id) passed
           from academy_quiz_attempts q
           where q.user_id = e.user_id order by content_id, created_at desc
         ) latest
       ) latest on true
       left join lateral (
         select count(*) as open_count from command_followups f
         where f.user_id = e.user_id and f.status <> 'resolved'
       ) tasks on true
       where ($1::uuid is null or e.assigned_officer = $1)
       order by p.in_game_name
       limit 10000`,
      [scope],
    );
    const columns = [
      ["Player", "in_game_name"],
      ["Communication preference", "communication_preference"],
      ["Identity status", "identity_status"],
      ["Onboarding status", "onboarding_status"],
      ["Acknowledged requirements", "required_acknowledgments"],
      ["Required total", "required_total"],
      ["Failed latest checks", "failed_latest_checks"],
      ["Open follow-ups", "open_followups"],
      ["Future R3 interest", "officer_interest"],
    ];
    const csv = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...rows.map((row) => columns.map(([, key]) => csvCell(row[key])).join(",")),
    ].join("\r\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="bf2-command-report.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  }

  const [confusion, officerFollowups] = await Promise.all([
    query(
      `with latest_quiz as (
         select distinct on (q.user_id, q.content_id)
           q.user_id, q.content_id, q.passed
         from academy_quiz_attempts q
         where $1::uuid is null or exists (
           select 1 from academy_enrollments e where e.user_id = q.user_id and e.assigned_officer = $1
         )
         order by q.user_id, q.content_id, q.created_at desc
       )
       select c.slug, c.title,
              count(distinct l.user_id) filter (where l.passed = false)::int as failed_latest,
              count(distinct p.user_id) filter (where p.needs_assistance)::int as help_requests
       from academy_content c
       left join latest_quiz l on l.content_id = c.id
       left join academy_progress p on p.content_id = c.id and ($1::uuid is null or exists (
         select 1 from academy_enrollments e where e.user_id = p.user_id and e.assigned_officer = $1
       ))
       where c.status = 'published' and c.content_type in ('rule', 'module')
       group by c.id order by failed_latest desc, help_requests desc, c.slug`,
      [scope],
    ),
    query(
      `select coalesce(p.in_game_name, 'Unassigned') as officer,
              count(*)::int as unresolved_tasks
       from command_followups f
       left join profiles p on p.id = f.assigned_to
       where f.status <> 'resolved' and ($1::uuid is null or exists (
         select 1 from academy_enrollments e where e.user_id = f.user_id and e.assigned_officer = $1
       ))
       group by f.assigned_to, p.in_game_name
       order by unresolved_tasks desc, officer`,
      [scope],
    ),
  ]);
  return NextResponse.json({ confusion, officer_followups: officerFollowups }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
