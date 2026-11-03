import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/server/http";
import { jsonError } from "@/lib/server/http";
import { queryOne, withTransaction } from "@/lib/server/db";

const COMMUNICATION_OPTIONS = new Set(["external_chat", "website", "both"]);
const OFFICER_INTEREST_OPTIONS = new Set(["yes", "later", "no"]);

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const preference = body?.communication_preference;
  const mailHelp = body?.alliance_mail_help;
  const officerInterest = body?.officer_interest;
  const hasPreference = preference !== undefined;
  const hasMailHelp = mailHelp !== undefined;
  const hasInterest = officerInterest !== undefined;

  if (
    (!hasPreference && !hasMailHelp && !hasInterest) ||
    (hasPreference && (typeof preference !== "string" || !COMMUNICATION_OPTIONS.has(preference))) ||
    (hasMailHelp && typeof mailHelp !== "boolean") ||
    (hasInterest && (typeof officerInterest !== "string" || !OFFICER_INTEREST_OPTIONS.has(officerInterest)))
  ) {
    return jsonError("Invalid academy preference.");
  }

  const enrolled = await queryOne<{ user_id: string }>(
    `select user_id from academy_enrollments where user_id = $1`,
    [user.id],
  );
  if (!enrolled) return jsonError("Redeem a BF2 recruit invitation to continue.", 403);

  const onboardingComplete = await withTransaction(async (client) => {
    if (hasPreference) {
      await client.query(
        `update academy_enrollments set communication_preference = $2 where user_id = $1`,
        [user.id, preference],
      );
    }
    if (hasMailHelp) {
      await client.query(
        `update academy_enrollments set alliance_mail_help = $2 where user_id = $1`,
        [user.id, mailHelp],
      );
      if (mailHelp) {
        await client.query(
          `insert into command_followups
             (user_id, issue_key, content_id, reason, assigned_to, created_by)
           values ($1, 'help:alliance-mail',
             (select id from academy_content where slug = 'rule-03-alliance-mail' and status = 'published'),
             'Recruit requested help finding mandatory alliance mail.',
             (select assigned_officer from academy_enrollments where user_id = $1), $1)
           on conflict (user_id, issue_key) where status <> 'resolved'
           do update set reason = excluded.reason, updated_at = now()`,
          [user.id],
        );
      }
    }
    if (hasInterest) {
      await client.query(
        `update academy_enrollments set officer_interest = $2 where user_id = $1`,
        [user.id, officerInterest],
      );
    }
    const completion = await client.query<{ done: boolean }>(
      `select e.officer_interest is not null
       and nullif(trim(e.game_identifier), '') is not null and not exists (
         select 1 from academy_content c
         left join academy_acknowledgments a on a.user_id = e.user_id and a.content_id = c.id
         where c.status = 'published' and c.required
           and c.content_type in ('rule', 'module') and a.user_id is null
       ) as done
       from academy_enrollments e where e.user_id = $1`,
      [user.id],
    );
    const done = completion.rows[0]?.done ?? false;
    if (done) {
      await client.query(
        `update academy_enrollments set completed_at = coalesce(completed_at, now())
         where user_id = $1`,
        [user.id],
      );
    }
    return done;
  });

  return NextResponse.json({ saved: true, onboarding_complete: onboardingComplete });
}
