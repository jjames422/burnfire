import { NextResponse, type NextRequest } from "next/server";
import { trustedAuthOrigin } from "@/lib/auth/security";
import { getSessionUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { logAuthFailure } from "@/lib/auth/logging";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to manage your passkeys.", 401);
    const passkeys = await query(
      `select credential_id as id, name, created_at, last_used_at, device_type, backed_up
       from passkeys where user_id = $1 order by created_at desc`, [user.id],
    );
    return NextResponse.json({ passkeys }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    logAuthFailure("PASSKEY_LIST_FAILED");
    return jsonError("Passkeys could not be loaded. Please try again.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!trustedAuthOrigin(request.headers.get("origin"), request.url)) return jsonError("Use the secure BurnFire portal to manage passkeys.", 403);
  try {
    const user = await getSessionUser();
    if (!user) return jsonError("Sign in to manage your passkeys.", 401);
    const body = await request.json().catch(() => null);
    if (typeof body?.id !== "string") return jsonError("Choose a passkey to remove.");
    const removed = await query(
      "delete from passkeys where credential_id = $1 and user_id = $2 returning credential_id", [body.id, user.id],
    );
    if (!removed.length) return jsonError("This passkey was not found.", 404);
    return NextResponse.json({ deleted: true });
  } catch {
    logAuthFailure("PASSKEY_DELETE_FAILED");
    return jsonError("The passkey could not be removed. Please try again.", 503);
  }
}
