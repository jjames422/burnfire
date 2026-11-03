import { NextResponse, type NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/server/http";
import { withTransaction } from "@/lib/server/db";

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  const body = await request.json().catch(() => null);
  const identifier = typeof body?.game_identifier === "string" ? body.game_identifier.trim() : "";
  if (identifier.length < 2 || identifier.length > 80) return jsonError("Enter your game identifier (2-80 characters).");

  const result = await withTransaction(async (client) => {
    const profile = await client.query("select id from profiles where id = $1 for update", [user.id]);
    if (!profile.rowCount) return { error: "Complete your player profile first.", status: 409 };
    const membership = await client.query("select alliance from alliance_members where user_id = $1", [user.id]);
    if (membership.rows[0] && membership.rows[0].alliance !== "burnfire") {
      return { error: "Your account already belongs to another alliance.", status: 409 };
    }
    await client.query(
      `insert into academy_enrollments (user_id, game_identifier)
       values ($1, $2) on conflict (user_id) do nothing`,
      [user.id, identifier],
    );
    return { enrolled: true };
  });
  if ("error" in result && result.error) return jsonError(result.error, result.status ?? 400);
  return NextResponse.json(result);
}
