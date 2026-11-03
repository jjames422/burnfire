import { NextResponse, type NextRequest } from "next/server";
import { requireCommandOfficer } from "@/lib/server/command";
import { queryOne, withTransaction } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { user, response } = await requireCommandOfficer("r4");
  if (response) return response;
  const { userId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonError("Recruit was not found.", 404);
  }
  const body = await request.json().catch(() => null);
  const assignedTo =
    body?.assigned_to === null || typeof body?.assigned_to === "string"
      ? body.assigned_to
      : undefined;
  if (
    assignedTo === undefined ||
    (assignedTo !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedTo))
  ) {
    return jsonError("Select a verified R3 or higher officer or clear the assignment.");
  }

  if (assignedTo) {
    const eligible = await queryOne<{ user_id: string }>(
      `select user_id from alliance_members
       where user_id = $1 and alliance = 'burnfire'
         and verified_at is not null and game_rank in ('r3', 'r4', 'r5')`,
      [assignedTo],
    );
    if (!eligible) return jsonError("Recruit assignments are limited to verified R3+ officers.", 400);
  }

  const updated = await withTransaction(async (client) => {
    const { rows: [recruit] } = await client.query<{ assigned_officer: string | null }>(
      "select assigned_officer from academy_enrollments where user_id = $1 for update", [userId],
    );
    if (!recruit) return false;
    await client.query("update academy_enrollments set assigned_officer = $2 where user_id = $1", [userId, assignedTo]);
    if (recruit.assigned_officer !== assignedTo) {
      await client.query(
        "insert into recruit_assignment_history (user_id, changed_by, previous_officer, new_officer) values ($1, $2, $3, $4)",
        [userId, user.id, recruit.assigned_officer, assignedTo],
      );
    }
    return true;
  });
  if (!updated) return jsonError("Recruit was not found.", 404);
  return NextResponse.json({ assigned_to: assignedTo });
}
