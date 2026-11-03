import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { chatBus } from "@/lib/server/events";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";

/** Pin or unpin a message (moderators). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: messageId } = await params;

  const body = await request.json().catch(() => null);
  const pin = Boolean(body?.pin);
  try {
    await query(`select pin_message($1, $2, $3)`, [user.id, messageId, pin]);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Pin unavailable."));
  }
  const row = await queryOne<{ channel_id: string }>(
    `select channel_id from messages where id = $1`,
    [messageId],
  );
  if (row) chatBus.publish(row.channel_id, { type: "message" });
  return NextResponse.json({ pinned: pin });
}
