import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { publishChannelEvent } from "@/lib/server/events";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";

/** Toggles the caller's emoji reaction on a message. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: messageId } = await params;

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";
  if (!emoji || emoji.length > 100) return jsonError("Invalid reaction.");

  let added: boolean;
  try {
    const row = await queryOne<{ toggle_message_reaction: boolean }>(
      `select toggle_message_reaction($1, $2, $3)`,
      [user.id, messageId, emoji],
    );
    added = Boolean(row?.toggle_message_reaction);
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Reaction failed."));
  }

  const channel = await queryOne<{ channel_id: string }>(
    `select channel_id from messages where id = $1`,
    [messageId],
  );
  if (channel) await publishChannelEvent(channel.channel_id, { type: "message" });
  return NextResponse.json({ added });
}
