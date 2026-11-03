import { NextResponse, type NextRequest } from "next/server";
import { requestLoginCode } from "@/lib/server/auth";
import { jsonError } from "@/lib/server/http";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { logAuthFailure } from "@/lib/auth/logging";

export async function POST(request: NextRequest) {
  if (!trustedAuthOrigin(request.headers.get("origin"), request.url)) return jsonError("Use the secure BurnFire portal to sign in.", 403);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  try {
    const { error } = await requestLoginCode(email);
    if (error) return jsonError(error);
    return NextResponse.json({ sent: true });
  } catch {
    logAuthFailure("CODE_REQUEST_FAILED");
    return jsonError("Sign-in is temporarily unavailable. Please try again.", 503);
  }
}
