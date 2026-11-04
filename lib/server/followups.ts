import type { PoolClient } from "pg";

export async function resolveFollowup(
  client: PoolClient,
  id: string,
  actorId: string,
  update: { notes?: string; assignedTo?: string | null } = {},
): Promise<boolean> {
  const { rows: [current] } = await client.query<{
    user_id: string; content_id: string | null; issue_key: string;
    status: string; officer_notes: string; assigned_to: string | null;
  }>("select * from command_followups where id = $1 for update", [id]);
  if (!current) return false;
  const notes = update.notes ?? current.officer_notes;
  const assignedTo = update.assignedTo === undefined ? current.assigned_to : update.assignedTo;
  if (current.status !== "resolved" || notes !== current.officer_notes || assignedTo !== current.assigned_to) {
    await client.query(
      `insert into command_followup_history
         (followup_id, editor_id, previous_status, previous_notes, previous_assigned_to)
       values ($1, $2, $3, $4, $5)`,
      [id, actorId, current.status, current.officer_notes, current.assigned_to],
    );
    await client.query(
      `update command_followups set status = 'resolved', officer_notes = $2, assigned_to = $3,
         updated_at = now(), resolved_at = coalesce(resolved_at, now()) where id = $1`,
      [id, notes, assignedTo],
    );
    if (current.issue_key === "help:alliance-mail") {
      await client.query(
        "update academy_enrollments set alliance_mail_help = false where user_id = $1",
        [current.user_id],
      );
    }
    if (current.content_id) {
      await client.query(
        `update academy_progress set needs_assistance = false,
           status = case when status = 'needs_assistance' then 'in_progress' else status end,
           updated_at = now()
         where user_id = $1 and content_id = $2 and not exists (
           select 1 from command_followups
           where user_id = $1 and content_id = $2 and status <> 'resolved'
         )`,
        [current.user_id, current.content_id],
      );
    }
  }
  return true;
}
