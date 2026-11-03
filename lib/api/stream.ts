"use client";

import { useEffect } from "react";
import type { ChatStreamEvent } from "./types";

/**
 * One shared EventSource per channel, refcounted across subscribers
 * (message list, composer typing, presence rail), so each chat view keeps
 * a single realtime connection.
 */

type Listener = (event: ChatStreamEvent) => void;

interface Connection {
  source: EventSource;
  listeners: Set<Listener>;
}

const connections = new Map<string, Connection>();

export function subscribeChannelStream(channelId: string, listener: Listener): () => void {
  let connection = connections.get(channelId);
  if (!connection) {
    const source = new EventSource(`/api/channels/${channelId}/events`);
    connection = { source, listeners: new Set() };
    const current = connection;
    source.onmessage = (event) => {
      let parsed: { type: string };
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      if (parsed.type === "ping") return;
      for (const fn of current.listeners) {
        try {
          fn(parsed as ChatStreamEvent);
        } catch {
          // One broken subscriber never blocks the rest.
        }
      }
    };
    connections.set(channelId, connection);
  }

  connection.listeners.add(listener);
  return () => {
    const existing = connections.get(channelId);
    if (!existing) return;
    existing.listeners.delete(listener);
    if (existing.listeners.size === 0) {
      existing.source.close();
      connections.delete(channelId);
    }
  };
}

/** React hook wrapper around subscribeChannelStream. */
export function useChannelStream(channelId: string | null, listener: Listener): void {
  useEffect(() => {
    if (!channelId) return;
    return subscribeChannelStream(channelId, listener);
    // Callers pass stable callbacks (useCallback) — resubscribe on channel change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);
}
