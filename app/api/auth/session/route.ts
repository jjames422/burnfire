import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import type { ProfileRow, SessionInfo } from "@/lib/api/types";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, profile: null } satisfies SessionInfo);
  }
  const profile = await queryOne<ProfileRow>(
    `select * from profiles where id = $1`,
    [user.id],
  );
  return NextResponse.json({ user, profile } satisfies SessionInfo);
}
