import { NextResponse, type NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { chatBus } from "@/lib/server/events";
import { jsonError, requireUser } from "@/lib/server/http";

/** Broadcasts a typing indicator to everyone watching the channel stream. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (response) return response;
  const { id: channelId } = await params;

  const allowed = await queryOne<{ can_access_channel: boolean }>(
    `select can_access_channel($1, $2)`,
    [user.id, channelId],
  );
  if (!allowed?.can_access_channel) return jsonError("Channel access denied.", 403);

  const body = await request.json().catch(() => null);
  const typing = Boolean(body?.typing);
  const identity = await queryOne<{ get_my_chat_identity: string }>(
    `select get_my_chat_identity($1)`,
    [user.id],
  );

  chatBus.publish(channelId, {
    type: "typing",
    user_id: user.id,
    identity_label: identity?.get_my_chat_identity ?? "A survivor",
    typing,
  });
  return NextResponse.json({ ok: true });
}
