import { NextResponse, type NextRequest } from "next/server";
import { query } from "@/lib/server/db";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";

const TARGET_TYPES = new Set(["comment", "message", "fan_art"]);

/** Private moderation reports. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const targetType = typeof body?.target_type === "string" ? body.target_type : "";
  const targetId = typeof body?.target_id === "string" ? body.target_id : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!TARGET_TYPES.has(targetType) || !targetId) return jsonError("Invalid report target.");
  if (reason.length < 3 || reason.length > 500) {
    return jsonError("Please explain the problem in at least 3 characters.");
  }

  try {
    await query(
      `insert into content_reports (reporter_id, target_type, target_id, reason)
       values ($1, $2, $3, $4)`,
      [user.id, targetType, targetId, reason],
    );
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "You already reported this."));
  }
  return NextResponse.json({ ok: true });
}
