import type { NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { jsonError, requireUser } from "@/lib/server/http";
import { openStoredFile } from "@/lib/server/storage";

/**
 * Streams a chat attachment to signed-in users who can see the owning
 * message's channel (mirrors the old private-bucket signed URLs).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: attachmentId } = await params;

  const attachment = await queryOne<{
    storage_path: string;
    file_name: string;
    mime_type: string;
    channel_id: string;
  }>(
    `select a.storage_path, a.file_name, a.mime_type, m.channel_id
     from chat_attachments a
     join messages m on m.id = a.message_id
     where a.id = $1 and m.deleted_at is null`,
    [attachmentId],
  );
  if (!attachment) return jsonError("Attachment not found.", 404);

  const allowed = await queryOne<{ can_access_channel: boolean }>(
    `select can_access_channel($1, $2)`,
    [user.id, attachment.channel_id],
  );
  if (!allowed?.can_access_channel) return jsonError("Attachment not found.", 404);

  const file = await openStoredFile(attachment.storage_path);
  if (!file) return jsonError("Attachment file is missing.", 404);

  return new Response(file.stream, {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${attachment.file_name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=600",
    },
  });
}
