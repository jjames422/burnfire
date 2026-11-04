import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer, trainingScope } from "@/lib/server/command";
import { query, withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { resolveFollowup } from "@/lib/server/followups";

const FOLLOWUP_STATUSES = new Set([
  "open",
  "contacted",
  "awaiting_response",
  "resolved",
]);

export async function GET(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const includeResolved = request.nextUrl.searchParams.get("resolved") === "true";
  const followups = await query(
    `select f.id, f.user_id, p.in_game_name, f.issue_key, c.title as training_title,
            f.reason, f.status, f.assigned_to, assigned.in_game_name as assigned_officer_name,
            f.officer_notes, f.created_at, f.updated_at, f.resolved_at, history.edits
     from command_followups f
     join profiles p on p.id = f.user_id
     left join academy_content c on c.id = f.content_id
     left join profiles assigned on assigned.id = f.assigned_to
     left join lateral (
       select coalesce(jsonb_agg(jsonb_build_object(
         'previous_status', h.previous_status, 'previous_notes', h.previous_notes,
         'edited_at', h.edited_at, 'editor_name', editor.in_game_name
       ) order by h.edited_at desc), '[]'::jsonb) as edits
       from command_followup_history h
       left join profiles editor on editor.id = h.editor_id
       where h.followup_id = f.id
     ) history on true
     where ($1::uuid is null or exists (
       select 1 from academy_enrollments e where e.user_id = f.user_id and e.assigned_officer = $1
     )) ${includeResolved ? "" : "and f.status <> 'resolved'"}
     order by case f.status when 'open' then 0 when 'contacted' then 1
              when 'awaiting_response' then 2 else 3 end, f.created_at asc
     limit 200`,
    [trainingScope(officer, user.id)],
  );
  return NextResponse.json({ followups });
}

export async function PATCH(request: NextRequest) {
  const { user, officer, response } = await requireCommandOfficer();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : undefined;
  const notes = typeof body?.officer_notes === "string" ? body.officer_notes.trim() : undefined;
  const assignedTo =
    body?.assigned_to === null || typeof body?.assigned_to === "string"
      ? body.assigned_to
      : undefined;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
    (status !== undefined && !FOLLOWUP_STATUSES.has(status)) ||
    (notes !== undefined && notes.length > 4000) ||
    (assignedTo !== undefined && assignedTo !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedTo)) ||
    (status === undefined && notes === undefined && assignedTo === undefined)
  ) {
    return jsonError("Invalid follow-up update.");
  }
  if (assignedTo !== undefined && trainingScope(officer, user.id) !== null) {
    return jsonError("Only leadership can reassign follow-up work.", 403);
  }

  if (typeof assignedTo === "string") {
    const eligible = await query(
      `select 1 from alliance_members
       where user_id = $1 and alliance = 'burnfire'
         and verified_at is not null and game_rank in ('r3', 'r4', 'r5')`,
      [assignedTo],
    );
    if (!eligible.length) return jsonError("Follow-ups can only be assigned to verified R3+ officers.", 400);
  }

  const result = await withTransaction(async (client) => {
    const accessible = await client.query(
      `select f.id from command_followups f
       where f.id = $1 and ($2::uuid is null or exists (
         select 1 from academy_enrollments e where e.user_id = f.user_id and e.assigned_officer = $2
       )) for update of f`, [id, trainingScope(officer, user.id)],
    );
    if (!accessible.rowCount) return false;
    if (status === "resolved") {
      return resolveFollowup(client, id, user.id, { notes, assignedTo });
    }
    const currentResult = await client.query<{
      status: string;
      officer_notes: string;
      assigned_to: string | null;
      user_id: string;
      issue_key: string;
      content_id: string | null;
    }>(
      `select status, officer_notes, assigned_to, user_id, issue_key, content_id
       from command_followups where id = $1 for update`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) return false;

    const nextStatus = status ?? current.status;
    const nextNotes = notes ?? current.officer_notes;
    const nextAssigned = assignedTo === undefined ? current.assigned_to : assignedTo;
    if (
      current.status !== nextStatus ||
      current.officer_notes !== nextNotes ||
      current.assigned_to !== nextAssigned
    ) {
      await client.query(
        `insert into command_followup_history
           (followup_id, editor_id, previous_status, previous_notes, previous_assigned_to)
         values ($1, $2, $3, $4, $5)`,
        [id, user.id, current.status, current.officer_notes, current.assigned_to],
      );
      await client.query(
        `update command_followups set status = $2, officer_notes = $3,
           assigned_to = $4, updated_at = now(),
           resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) else null end
         where id = $1`,
        [id, nextStatus, nextNotes, nextAssigned],
      );
    }
    return true;
  });

  if (!result) return jsonError("Follow-up task was not found.", 404);
  return NextResponse.json({ saved: true });
}
