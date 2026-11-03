import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { user, response } = await requireCommandOfficer();
  if (response) return response;
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return jsonError("Officer note was not found.", 404);
  }
  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (text.length < 1 || text.length > 4000) {
    return jsonError("Enter an officer note of up to 4,000 characters.");
  }

  const updated = await withTransaction(async (client) => {
    const result = await client.query<{ body: string }>(
      `select n.body from command_notes n
       join academy_enrollments e on e.user_id = n.user_id
       where n.id = $1 for update of n`,
      [id],
    );
    const note = result.rows[0];
    if (!note) return false;
    if (note.body !== text) {
      await client.query(
        `insert into command_note_history (note_id, editor_id, previous_body)
         values ($1, $2, $3)`,
        [id, user.id, note.body],
      );
      await client.query(
        `update command_notes set body = $2, updated_at = now() where id = $1`,
        [id, text],
      );
    }
    return true;
  });
  if (!updated) return jsonError("Officer note was not found.", 404);
  return NextResponse.json({ saved: true });
}
