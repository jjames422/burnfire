import { NextResponse, type NextRequest } from "next/server";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { consumeLoginLink } from "@/lib/server/auth-links";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

// GET deliberately has no handler: opening/scanning an email never signs in.
export async function POST(request: NextRequest) {
  if (!trustedAuthOrigin(request.headers.get("origin"), request.url)) return jsonError("Open the secure BurnFire portal to sign in.", 403);
  const body = await request.json().catch(() => null);
  try {
    const result = await consumeLoginLink(body?.token);
    if (result.error) return jsonError(result.error);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logAuthFailure("LINK_CONSUMPTION_FAILED");
    return jsonError("Sign-in could not be completed. Request a new email link.", 503);
  }
}
