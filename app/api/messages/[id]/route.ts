import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { chatBus } from "@/lib/server/events";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";

async function channelOf(messageId: string): Promise<string | null> {
  const row = await queryOne<{ channel_id: string }>(
    `select channel_id from messages where id = $1`,
    [messageId],
  );
  return row?.channel_id ?? null;
}

/** Edit own message (24h window). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: messageId } = await params;

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body : "";
  try {
    await query(`select edit_message($1, $2, $3)`, [user.id, messageId, text]);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Message cannot be edited."));
  }
  const channelId = await channelOf(messageId);
  if (channelId) chatBus.publish(channelId, { type: "message" });
  return NextResponse.json({ ok: true });
}

/** Soft-delete own message. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: messageId } = await params;

  const channelId = await channelOf(messageId);
  try {
    await query(`select delete_message($1, $2)`, [user.id, messageId]);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Message cannot be deleted."));
  }
  if (channelId) chatBus.publish(channelId, { type: "message" });
  return NextResponse.json({ ok: true });
}
