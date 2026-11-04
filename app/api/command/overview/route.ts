import { NextResponse } from "next/server";
import { queryOne } from "@/lib/server/db";
import { canEditTraining, requireCommandOfficer, trainingScope } from "@/lib/server/command";

type Overview = {
  tracked_members: string;
  new_recruits: string;
  pending_invitations: string;
  onboarding_in_progress: string;
  onboarding_completed: string;
  awaiting_identity_verification: string;
  awaiting_acknowledgment: string;
  needs_assistance: string;
  failed_knowledge_checks: string;
  open_followups: string;
  website_preference: string;
  external_chat_preference: string;
  interested_in_r3: string;
};

export async function GET() {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;

  const metrics = await queryOne<Overview>(
    `with scoped_enrollments as (
       select * from academy_enrollments where $1::uuid is null or assigned_officer = $1
     )
     select
       (select count(*) from scoped_enrollments) as tracked_members,
       (select count(*) from scoped_enrollments
         where started_at >= now() - interval '7 days') as new_recruits,
       (select count(*) from command_invitations
         where redeemed_at is null and revoked_at is null and expires_at > now()
           and ($1::uuid is null or created_by = $1)) as pending_invitations,
       (select count(*) from scoped_enrollments
         where completed_at is null) as onboarding_in_progress,
       (select count(*) from scoped_enrollments
         where completed_at is not null) as onboarding_completed,
       (select count(*) from scoped_enrollments
         where identity_status = 'pending') as awaiting_identity_verification,
       (select count(distinct e.user_id)
         from scoped_enrollments e
         join academy_content c on c.status = 'published' and c.required
           and c.content_type in ('rule', 'module')
         left join academy_acknowledgments a
           on a.user_id = e.user_id and a.content_id = c.id
         where a.user_id is null) as awaiting_acknowledgment,
       (select count(distinct user_id) from academy_progress
         where (needs_assistance or status = 'needs_assistance')
           and user_id in (select user_id from scoped_enrollments)) as needs_assistance,
       (select count(*) from (
          select distinct on (user_id, content_id) user_id, passed
          from academy_quiz_attempts
          where user_id in (select user_id from scoped_enrollments)
          order by user_id, content_id, created_at desc
        ) latest where not passed) as failed_knowledge_checks,
       (select count(*) from command_followups where status <> 'resolved'
         and user_id in (select user_id from scoped_enrollments)) as open_followups,
       (select count(*) from scoped_enrollments where communication_preference = 'website') as website_preference,
       (select count(*) from scoped_enrollments where communication_preference = 'external_chat') as external_chat_preference,
       (select count(*) from scoped_enrollments where officer_interest in ('yes', 'later')) as interested_in_r3`,
    [trainingScope(officer, user.id)],
  );

  return NextResponse.json({
    metrics, officer_rank: officer.game_rank, is_site_admin: officer.is_site_admin,
    can_edit_content: canEditTraining(officer), assigned_only: trainingScope(officer, user.id) !== null,
  });
}
