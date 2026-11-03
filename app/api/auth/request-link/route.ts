import { NextResponse, type NextRequest } from "next/server";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { requestLoginLink } from "@/lib/server/auth-links";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

export async function POST(request: NextRequest) {
  const origin = trustedAuthOrigin(request.headers.get("origin"), request.url);
  if (!origin) return jsonError("Open the secure BurnFire portal to sign in.", 403);
  const body = await request.json().catch(() => null);
  try {
    const result = await requestLoginLink(typeof body?.email === "string" ? body.email : "", body?.returnTo, origin);
    if (result.error) return jsonError(result.error);
    return NextResponse.json({ sent: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logAuthFailure("LINK_REQUEST_FAILED");
    return jsonError("Sign-in is temporarily unavailable. Please try again.", 503);
  }
}
