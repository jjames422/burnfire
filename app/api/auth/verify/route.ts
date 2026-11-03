import { NextResponse, type NextRequest } from "next/server";
import { verifyLoginCode } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import type { ProfileRow } from "@/lib/api/types";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { logAuthFailure } from "@/lib/auth/logging";

export async function POST(request: NextRequest) {
  if (!trustedAuthOrigin(request.headers.get("origin"), request.url)) return jsonError("Use the secure BurnFire portal to sign in.", 403);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";

  try {
    const { user, error } = await verifyLoginCode(email, code);
    if (error || !user) return jsonError(error ?? "Sign-in failed.");

    const profile = await queryOne<ProfileRow>(
      `select * from profiles where id = $1`,
      [user.id],
    );
    return NextResponse.json({ user, profile }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logAuthFailure("CODE_VERIFICATION_FAILED");
    return jsonError("Sign-in could not be completed. Please try again.", 503);
  }
}
