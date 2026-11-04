import { NextResponse } from "next/server";
import { requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query } from "@/lib/server/db";

export async function GET() {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;

  const training = await query(
    `select e.user_id, p.in_game_name, c.id as content_id, c.slug, c.title,
            coalesce(progress.status, 'not_started') as status,
            coalesce(progress.needs_assistance, false) as needs_assistance,
            latest.passed as quiz_passed, ack.acknowledged_at
     from academy_enrollments e
     join profiles p on p.id = e.user_id
     cross join academy_content c
     left join academy_progress progress
       on progress.user_id = e.user_id and progress.content_id = c.id
     left join lateral (
       select passed from academy_quiz_attempts q
       where q.user_id = e.user_id and q.content_id = c.id
       order by q.created_at desc limit 1
     ) latest on true
     left join academy_acknowledgments ack
       on ack.user_id = e.user_id and ack.content_id = c.id
     where c.status = 'published' and c.required
       and c.content_type in ('rule', 'module')
       and ($1::uuid is null or e.assigned_officer = $1)
     order by p.in_game_name, c.slug
     limit 5000`,
    [trainingScope(officer, user.id)],
  );
  return NextResponse.json({ training });
}
