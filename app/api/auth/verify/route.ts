import { NextResponse, type NextRequest } from "next/server";
import { verifyLoginCode } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import type { ProfileRow } from "@/lib/api/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";

  const { user, error } = await verifyLoginCode(email, code);
  if (error || !user) return jsonError(error ?? "Sign-in failed.");

  const profile = await queryOne<ProfileRow>(
    `select * from profiles where id = $1`,
    [user.id],
  );
  return NextResponse.json({ user, profile });
}
