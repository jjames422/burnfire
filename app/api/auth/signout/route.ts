import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/lib/server/auth";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

export async function POST(request: NextRequest) {
  if (!trustedAuthOrigin(request.headers.get("origin"), request.url)) return jsonError("Use the secure BurnFire portal to sign out.", 403);
  try {
    await signOut();
    return NextResponse.json({ signed_out: true });
  } catch {
    logAuthFailure("SIGNOUT_FAILED");
    return jsonError("Sign-out could not be completed. Please try again.", 503);
  }
}
