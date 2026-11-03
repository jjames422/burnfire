import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { chatBus } from "@/lib/server/events";
import { databaseErrorMessage, jsonError, requireUser } from "@/lib/server/http";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  deleteStoredFile,
  saveChatAttachment,
} from "@/lib/server/storage";
import type {
  ChannelMessagesPayload,
  ChatAttachmentInfo,
  ChatMessageRow,
} from "@/lib/api/types";

/** Messages, pins, and attachment metadata for a channel in one payload. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: channelId } = await params;

  const messages = await query<ChatMessageRow>(
    `select * from get_channel_messages($1, $2, 100)`,
    [user.id, channelId],
  );
  const pins = await query<{ message_id: string }>(
    `select message_id from pinned_messages where channel_id = $1`,
    [channelId],
  );
  const attachmentRows =
    messages.length === 0
      ? []
      : await query<ChatAttachmentInfo & { id: string }>(
          `select id, message_id, file_name, mime_type, size_bytes
           from chat_attachments where message_id = any($1::uuid[])`,
          [messages.map((message) => message.id)],
        );

  const payload: ChannelMessagesPayload = {
    messages,
    pinned_message_ids: pins.map((pin) => pin.message_id),
    attachments: attachmentRows.map((row) => ({
      ...row,
      url: `/api/attachments/${row.id}`,
    })),
  };
  return NextResponse.json(payload);
}

/**
 * Posts a message. Accepts multipart form data so an attachment can ride
 * along: fields `body`, `parent_message_id`, `mentioned_user_ids` (JSON
 * array), and optional `attachment` file.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: channelId } = await params;

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Invalid request.");

  const body = String(form.get("body") ?? "");
  const parentRaw = form.get("parent_message_id");
  const parentMessageId = typeof parentRaw === "string" && parentRaw ? parentRaw : null;
  let mentionedUserIds: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("mentioned_user_ids") ?? "[]"));
    if (Array.isArray(parsed)) mentionedUserIds = parsed.map(String);
  } catch {
    // Ignore malformed mention payloads — the message still sends.
  }
  const attachment = form.get("attachment");
  const file = attachment instanceof File && attachment.size > 0 ? attachment : null;

  if (file) {
    if (file.size > MAX_ATTACHMENT_BYTES) return jsonError("Attachment is larger than 25 MB.");
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      return jsonError("Attachment type is not allowed.");
    }
  }

  let messageId: string;
  try {
    const row = await queryOne<{ post_channel_message: string }>(
      `select post_channel_message($1, $2, $3, $4, $5::uuid[])`,
      [user.id, channelId, body, parentMessageId, mentionedUserIds],
    );
    messageId = row!.post_channel_message;
  } catch (error) {
    return jsonError(databaseErrorMessage(error, "Message was not sent."));
  }

  let attachmentError: string | null = null;
  if (file) {
    try {
      const storagePath = await saveChatAttachment(user.id, file);
      try {
        await query(
          `insert into chat_attachments (message_id, uploader_id, storage_path, file_name, mime_type, size_bytes)
           values ($1, $2, $3, $4, $5, $6)`,
          [messageId, user.id, storagePath, file.name, file.type, file.size],
        );
      } catch (error) {
        await deleteStoredFile(storagePath);
        throw error;
      }
    } catch (error) {
      attachmentError = databaseErrorMessage(
        error,
        "Message sent, but the attachment could not be saved.",
      );
    }
  }

  chatBus.publish(channelId, { type: "message" });
  return NextResponse.json({ message_id: messageId, attachment_error: attachmentError });
}
