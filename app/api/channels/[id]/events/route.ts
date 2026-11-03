import type { NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import { chatBus, type ChatEvent } from "@/lib/server/events";
import { jsonError, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function sse(event: ChatEvent | { type: "ping" }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Per-channel realtime stream (SSE): new-message signals, typing
 * indicators, and presence. Holding this stream open is what marks the
 * user online in the channel.
 */
export async function GET(
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

  const identity = await queryOne<{ get_my_chat_identity: string }>(
    `select get_my_chat_identity($1)`,
    [user.id],
  );
  const identityLabel = identity?.get_my_chat_identity ?? "A survivor";

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ChatEvent | { type: "ping" }) => {
        if (closed) return;
        try {
          controller.enqueue(sse(event));
        } catch {
          cleanup();
        }
      };
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        chatBus.presenceLeave(channelId, user.id);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Stream already closed by the client.
        }
      };

      unsubscribe = chatBus.subscribe(channelId, send);
      chatBus.presenceJoin(channelId, user.id, identityLabel);
      send({ type: "presence", users: chatBus.presenceSnapshot(channelId) });
      heartbeat = setInterval(() => send({ type: "ping" }), 25_000);
      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
