import type { NextRequest } from "next/server";
import { queryOne } from "@/lib/server/db";
import {
  broadcastPresence,
  removePresence,
  subscribeChannelEvents,
  touchPresence,
  type ChatEvent,
} from "@/lib/server/events";
import { jsonError, requireUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";
// Serverless platforms cap streaming duration; when the limit closes the
// stream, the browser's EventSource reconnects automatically and the client
// refreshes state on reconnect.
export const maxDuration = 60;

const encoder = new TextEncoder();
const HEARTBEAT_MS = 20_000;

function sse(event: ChatEvent | { type: "ping" }): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Per-channel realtime stream (SSE): new-message signals, typing
 * indicators, and presence. Holding this stream open is what marks the
 * user online in the channel; presence rides a heartbeat table so it works
 * across server instances.
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
  let closeSubscription: (() => Promise<void>) | undefined;
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
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
        if (heartbeat) clearInterval(heartbeat);
        void closeSubscription?.();
        // Best-effort: drop presence and tell the rest of the channel.
        void removePresence(channelId, user.id)
          .then(() => broadcastPresence(channelId))
          .catch(() => {});
        try {
          controller.close();
        } catch {
          // Stream already closed by the client.
        }
      };

      request.signal.addEventListener("abort", cleanup);
      try {
        closeSubscription = await subscribeChannelEvents(channelId, send);
        await touchPresence(channelId, user.id, identityLabel);
        await broadcastPresence(channelId);
        heartbeat = setInterval(() => {
          send({ type: "ping" });
          void touchPresence(channelId, user.id, identityLabel).catch(() => {});
        }, HEARTBEAT_MS);
      } catch {
        cleanup();
      }
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
