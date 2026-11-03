import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";
import type { ProfileRow } from "@/lib/api/types";

/** One-time community profile creation (first sign-in). */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const inGameName =
    typeof body?.in_game_name === "string" ? body.in_game_name.trim() : "";
  if (inGameName.length < 1 || inGameName.length > 40) {
    return jsonError("In-game name must be between 1 and 40 characters.");
  }

  const existing = await queryOne<ProfileRow>(
    `select * from profiles where id = $1`,
    [user.id],
  );
  if (existing) return jsonError("Profile already exists.", 409);

  const profile = await queryOne<ProfileRow>(
    `insert into profiles (id, in_game_name, display_name)
     values ($1, $2, $2)
     returning *`,
    [user.id, inGameName],
  );
  return NextResponse.json({ profile });
}
