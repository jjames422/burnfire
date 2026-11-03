import { Client } from "pg";
import { pool, query } from "./db";

/**
 * Realtime chat signaling through Postgres, so it works when the site runs
 * on serverless hosting (each API invocation may be a different instance):
 * - events (new message / typing) travel over NOTIFY/LISTEN
 * - presence is a heartbeat table written by the SSE stream handlers
 */

const NOTIFY_CHANNEL = "burnfire_chat";
const PRESENCE_TTL_SECONDS = 45;

export type ChatEvent =
  | { type: "message" }
  | { type: "typing"; user_id: string; identity_label: string; typing: boolean }
  | { type: "presence"; users: PresenceEntry[] };

export interface PresenceEntry {
  user_id: string;
  identity_label: string;
}

type WireEvent = { channel_id: string; event: ChatEvent };

/** Broadcasts an event to every stream subscribed to the channel. */
export async function publishChannelEvent(channelId: string, event: ChatEvent): Promise<void> {
  const payload: WireEvent = { channel_id: channelId, event };
  await pool.query(`select pg_notify($1, $2)`, [NOTIFY_CHANNEL, JSON.stringify(payload)]);
}

/**
 * Opens a dedicated LISTEN connection for one SSE stream. Returns a closer.
 * A dedicated client (not the pool) is required — LISTEN is per-connection.
 */
export async function subscribeChannelEvents(
  channelId: string,
  onEvent: (event: ChatEvent) => void,
): Promise<() => Promise<void>> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  client.on("notification", (message) => {
    if (!message.payload) return;
    try {
      const wire = JSON.parse(message.payload) as WireEvent;
      if (wire.channel_id === channelId) onEvent(wire.event);
    } catch {
      // Malformed payloads are dropped.
    }
  });
  client.on("error", () => {
    // Connection loss ends the stream; the browser's EventSource reconnects.
  });
  await client.query(`listen ${NOTIFY_CHANNEL}`);
  return async () => {
    await client.end().catch(() => {});
  };
}

/** Records (or refreshes) a user's presence heartbeat in a channel. */
export async function touchPresence(
  channelId: string,
  userId: string,
  identityLabel: string,
): Promise<void> {
  await query(
    `insert into channel_presence (channel_id, user_id, identity_label, last_seen_at)
     values ($1, $2, $3, now())
     on conflict (channel_id, user_id)
     do update set identity_label = excluded.identity_label, last_seen_at = now()`,
    [channelId, userId, identityLabel],
  );
}

export async function removePresence(channelId: string, userId: string): Promise<void> {
  await query(`delete from channel_presence where channel_id = $1 and user_id = $2`, [
    channelId,
    userId,
  ]);
}

/** Current (non-stale) roster for a channel; prunes expired rows as it goes. */
export async function presenceRoster(channelId: string): Promise<PresenceEntry[]> {
  await query(
    `delete from channel_presence where last_seen_at < now() - interval '${PRESENCE_TTL_SECONDS} seconds'`,
  );
  return query<PresenceEntry>(
    `select user_id, identity_label from channel_presence
     where channel_id = $1 order by identity_label`,
    [channelId],
  );
}

/** Publishes the fresh roster to everyone watching the channel. */
export async function broadcastPresence(channelId: string): Promise<void> {
  const users = await presenceRoster(channelId);
  await publishChannelEvent(channelId, { type: "presence", users });
}
