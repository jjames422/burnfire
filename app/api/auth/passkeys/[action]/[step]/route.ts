import { NextResponse, type NextRequest } from "next/server";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { authenticationOptions, authenticatePasskey, registrationOptions, registerPasskey } from "@/lib/server/passkeys";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

export async function POST(request: NextRequest, context: { params: Promise<{ action: string; step: string }> }) {
  const origin = trustedAuthOrigin(request.headers.get("origin"), request.url);
  if (!origin) return jsonError("Use the secure BurnFire portal for passkeys.", 403);
  const { action, step } = await context.params;
  if (!["register", "authenticate"].includes(action) || !["options", "verify"].includes(step)) {
    return jsonError("Unknown passkey action.", 404);
  }
  try {
    if (step === "options") {
      const options = action === "register" ? await registrationOptions(origin) : await authenticationOptions(origin);
      return NextResponse.json(options, { headers: { "Cache-Control": "no-store" } });
    }
    const body = await request.json().catch(() => null);
    if (!body?.response || typeof body.response !== "object") return jsonError("A passkey response is required.");
    if (action === "register") await registerPasskey(origin, body.response, body.name);
    else await authenticatePasskey(origin, body.response);
    return NextResponse.json({ verified: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logAuthFailure("PASSKEY_VERIFICATION_FAILED");
    const message = error instanceof Error ? error.message : "";
    // Only surface our own actionable errors, never library/database internals.
    const safe = /^(Sign in again|The passkey request expired|You have reached|This passkey is |The passkey (could not|response was|account did not))/.test(message);
    return jsonError(safe ? message : "Passkey verification failed. Try again or sign in with email.");
  }
}
