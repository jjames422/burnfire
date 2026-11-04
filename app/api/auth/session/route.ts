import { NextResponse } from "next/server";
import { getSessionUser, rememberAccount } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import type { ProfileRow, SessionInfo } from "@/lib/api/types";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ user: null, profile: null } satisfies SessionInfo, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const profile = await queryOne<ProfileRow>(
      `select * from profiles where id = $1`,
      [user.id],
    );
    await rememberAccount();
    return NextResponse.json({ user, profile } satisfies SessionInfo, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    logAuthFailure("SESSION_LOAD_FAILED");
    return jsonError("Your session could not be loaded. Please try again.", 503);
  }
}
