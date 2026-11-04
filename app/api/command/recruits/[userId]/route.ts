import { NextResponse, type NextRequest } from "next/server";
import { canManageLeadership, requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query, queryOne } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { localizeTrainingRows, type TrainingSourceRow } from "@/lib/server/training-localization";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonError("Recruit was not found.", 404);
  }

  const emailColumn = canManageLeadership(officer) ? ", u.email" : "";
  const recruit = await queryOne<Record<string, string | number | null>>(
    `select e.user_id, p.in_game_name, e.game_identifier, e.communication_preference,
            e.alliance_mail_help, e.officer_interest, e.identity_status,
            e.identity_verified_at, verifier.in_game_name as verified_by_name,
            e.started_at, e.completed_at, e.current_step, e.assigned_officer,
            assigned.in_game_name as assigned_officer_name
            ${emailColumn}
     from academy_enrollments e
     join profiles p on p.id = e.user_id
     join users u on u.id = e.user_id
     left join profiles verifier on verifier.id = e.identity_verified_by
     left join profiles assigned on assigned.id = e.assigned_officer
     where e.user_id = $1 and ($2::uuid is null or e.assigned_officer = $2)`,
    [userId, trainingScope(officer, user.id)],
  );
  if (!recruit) return jsonError("Recruit was not found.", 404);

  const [invitation, training, followups, notes, noteHistory, identityHistory, officers] = await Promise.all([
    queryOne(
      `select i.created_at, i.opened_at, i.redeemed_at, inviter.in_game_name as invited_by_name
       from academy_enrollments e
       join command_invitations i on i.id = e.invitation_id
       left join profiles inviter on inviter.id = i.created_by
       where e.user_id = $1`,
      [userId],
    ),
    query<TrainingSourceRow & Record<string, unknown>>(
      `select c.id, c.slug, c.title, c.version, c.body, c.verification_status,
              coalesce(p.status, 'not_started') as status,
              p.updated_at, p.completed_at, a.acknowledged_at,
              latest.passed as quiz_passed, latest.created_at as quiz_at
       from academy_content c
       left join academy_progress p on p.content_id = c.id and p.user_id = $1
       left join academy_acknowledgments a on a.content_id = c.id and a.user_id = $1
       left join lateral (
         select passed, created_at from academy_quiz_attempts q
         where q.user_id = $1 and q.content_id = c.id
         order by q.created_at desc limit 1
       ) latest on true
       where c.status = 'published' and c.content_type in ('rule', 'module')
       order by c.slug`,
      [userId],
    ),
    query(
      `select f.id, f.issue_key, f.reason, f.status, f.officer_notes,
              f.created_at, f.updated_at, assigned.in_game_name as assigned_officer_name
       from command_followups f left join profiles assigned on assigned.id = f.assigned_to
       where f.user_id = $1 order by f.created_at desc`,
      [userId],
    ),
    query(
      `select n.id, n.body, n.created_at, n.updated_at, author.in_game_name as author_name
       from command_notes n join profiles author on author.id = n.author_id
       where n.user_id = $1 order by n.created_at desc`,
      [userId],
    ),
    query(
      `select h.note_id, h.previous_body, h.edited_at, editor.in_game_name as editor_name
       from command_note_history h
       join command_notes n on n.id = h.note_id
       left join profiles editor on editor.id = h.editor_id
       where n.user_id = $1 order by h.edited_at desc`,
      [userId],
    ),
    query(
      `select h.previous_status, h.new_status, h.note, h.changed_at,
              actor.in_game_name as changed_by_name
       from academy_identity_history h
       left join profiles actor on actor.id = h.changed_by
       where h.user_id = $1 order by h.changed_at desc`,
      [userId],
    ),
    query(
      `select p.id, p.in_game_name, am.game_rank
       from alliance_members am join profiles p on p.id = am.user_id
       where am.alliance = 'burnfire' and am.verified_at is not null
         and am.game_rank in ('r3', 'r4', 'r5')
       order by am.game_rank, p.in_game_name`,
    ),
  ]);
  return NextResponse.json({
    recruit,
    invitation,
    training: await localizeTrainingRows(training),
    followups,
    notes,
    note_history: noteHistory,
    identity_history: identityHistory,
    officers,
  });
}
