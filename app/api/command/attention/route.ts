import { NextResponse } from "next/server";
import { requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query } from "@/lib/server/db";
import { localizeJoinedTrainingRows, type TrainingSourceRow } from "@/lib/server/training-localization";

type AttentionRow = {
  user_id: string;
  in_game_name: string;
  issue_key: string;
  reason: string;
  training_title: string | null;
  training_source: TrainingSourceRow | null;
  created_at: string;
};

export async function GET() {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;

  const attention = await query<AttentionRow>(
    `with latest_quiz as (
       select distinct on (user_id, content_id) user_id, content_id, passed, created_at
       from academy_quiz_attempts
       order by user_id, content_id, created_at desc
     ),
     attention as (
       select e.user_id, 'not-started'::text as issue_key,
              'Onboarding has not been started.'::text as reason,
              null::text as training_title, e.started_at as created_at
       from academy_enrollments e
       where e.completed_at is null
         and not exists (
           select 1 from academy_progress p
           where p.user_id = e.user_id and p.status in ('in_progress', 'completed', 'needs_assistance')
         )
       union all
       select e.user_id, 'identity-pending', 'Game identity needs officer verification.',
              null, e.started_at
       from academy_enrollments e where e.identity_status = 'pending'
       union all
       select p.user_id, 'assistance:' || c.slug, 'Recruit requested help with this requirement.',
              c.title, p.updated_at
       from academy_progress p join academy_content c on c.id = p.content_id
       where p.needs_assistance or p.status = 'needs_assistance'
       union all
       select p.user_id, 'stalled:' || c.slug, 'Required section has had no progress for 7 days.',
              c.title, p.updated_at
       from academy_progress p join academy_content c on c.id = p.content_id
       where c.status = 'published' and c.required
         and p.status = 'in_progress' and p.updated_at < now() - interval '7 days'
       union all
       select l.user_id, 'failed-quiz:' || c.slug, 'Latest knowledge check was not passed.',
              c.title, l.created_at
       from latest_quiz l
       join academy_content c on c.id = l.content_id
       join academy_enrollments e on e.user_id = l.user_id
       where c.status = 'published' and not l.passed
       union all
       select e.user_id, 'unacknowledged:' || c.slug, 'Required current version has not been acknowledged.',
              c.title, e.started_at
       from academy_enrollments e
       cross join academy_content c
       left join academy_acknowledgments a on a.user_id = e.user_id and a.content_id = c.id
       where c.status = 'published' and c.required
         and c.content_type in ('rule', 'module') and a.user_id is null
       union all
       select e.user_id, 'help:alliance-mail',
              'Recruit requested help locating mandatory alliance mail.',
              'Mandatory Alliance Mail', e.started_at
       from academy_enrollments e
       where e.alliance_mail_help is true
     )
     select a.user_id, p.in_game_name, a.issue_key, a.reason,
            a.training_title, a.created_at,
            (select jsonb_build_object('slug', c.slug, 'version', c.version, 'title', c.title, 'body', c.body)
             from academy_content c
             where c.slug = split_part(a.issue_key, ':', 2) and c.title = a.training_title
             order by c.version desc limit 1) as training_source
     from attention a join profiles p on p.id = a.user_id
     join academy_enrollments scope on scope.user_id = a.user_id
     where ($1::uuid is null or scope.assigned_officer = $1)
     order by a.created_at asc, p.in_game_name, a.issue_key
     limit 500`,
    [trainingScope(officer, user.id)],
  );
  return NextResponse.json({ attention: await localizeJoinedTrainingRows(attention) });
}
