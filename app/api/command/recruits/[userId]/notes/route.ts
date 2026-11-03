import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { queryOne } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ userId: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { user, response } = await requireCommandOfficer();
  if (response) return response;
  const { userId } = await params;
  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
    text.length < 1 ||
    text.length > 4000
  ) {
    return jsonError("Enter an officer note of up to 4,000 characters.");
  }

  const recruit = await queryOne<{ user_id: string }>(
    `select user_id from academy_enrollments where user_id = $1`,
    [userId],
  );
  if (!recruit) return jsonError("Recruit was not found.", 404);
  const note = await queryOne<{ id: string }>(
    `insert into command_notes (user_id, author_id, body)
     values ($1, $2, $3) returning id`,
    [userId, user.id, text],
  );
  return NextResponse.json({ note_id: note?.id });
}
