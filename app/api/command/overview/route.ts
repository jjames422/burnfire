import { NextResponse } from "next/server";
import { queryOne } from "@/lib/server/db";
import { requireCommandOfficer } from "@/lib/server/command";

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
  const { officer, response } = await requireCommandOfficer();
  if (response) return response;

  const metrics = await queryOne<Overview>(
    `select
       (select count(*) from academy_enrollments) as tracked_members,
       (select count(*) from academy_enrollments
         where started_at >= now() - interval '7 days') as new_recruits,
       (select count(*) from command_invitations
         where redeemed_at is null and revoked_at is null and expires_at > now()) as pending_invitations,
       (select count(*) from academy_enrollments
         where completed_at is null) as onboarding_in_progress,
       (select count(*) from academy_enrollments
         where completed_at is not null) as onboarding_completed,
       (select count(*) from academy_enrollments
         where identity_status = 'pending') as awaiting_identity_verification,
       (select count(distinct e.user_id)
         from academy_enrollments e
         join academy_content c on c.status = 'published' and c.required
           and c.content_type in ('rule', 'module')
         left join academy_acknowledgments a
           on a.user_id = e.user_id and a.content_id = c.id
         where a.user_id is null) as awaiting_acknowledgment,
       (select count(distinct user_id) from academy_progress
         where needs_assistance or status = 'needs_assistance') as needs_assistance,
       (select count(*) from (
          select distinct on (user_id, content_id) user_id, passed
          from academy_quiz_attempts order by user_id, content_id, created_at desc
        ) latest where not passed) as failed_knowledge_checks,
       (select count(*) from command_followups where status <> 'resolved') as open_followups,
       (select count(*) from academy_enrollments where communication_preference = 'website') as website_preference,
       (select count(*) from academy_enrollments where communication_preference = 'external_chat') as external_chat_preference,
       (select count(*) from academy_enrollments where officer_interest in ('yes', 'later')) as interested_in_r3`,
  );

  return NextResponse.json({ metrics, officer_rank: officer.game_rank, is_site_admin: officer.is_site_admin });
}
