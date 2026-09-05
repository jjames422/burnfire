"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

interface PresenceListProps {
  alliance: string;
  channelSlug: string;
}

interface PresenceEntry {
  user_id: string;
  display_name: string;
  display_rank: string | null;
}

/**
 * Realtime Presence, not a table — per-channel topic
 * `presence:<alliance>:<channel-slug>`. Ephemeral: join/leave/sync are
 * broadcast live, nothing is persisted, no RLS involved (this is a plain
 * Realtime channel, not tied to Postgres Changes).
 */
export function PresenceList({ alliance, channelSlug }: PresenceListProps) {
  const [users, setUsers] = useState<PresenceEntry[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;
    setUsers([]);

    async function join() {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await client
        .from("profiles")
        .select("display_name, display_rank")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      const presenceChannel = client.channel(`presence:${alliance}:${channelSlug}`, {
        config: { presence: { key: user.id } },
      });

      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState<PresenceEntry>();
          setUsers(Object.values(state).flat());
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            await presenceChannel.track({
              user_id: user.id,
              display_name: profile?.display_name ?? "Unknown",
              display_rank: profile?.display_rank ?? null,
            });
          }
        });

      if (cancelled) {
        client.removeChannel(presenceChannel);
        return;
      }
      channelRef.current = presenceChannel;
    }

    join();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        client.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [alliance, channelSlug]);

  return (
    <div className="w-full shrink-0 border border-border bg-surface p-4 sm:w-48">
      <h3 className="mb-3 font-display text-xs font-semibold tracking-wide text-text-secondary uppercase">
        Online — {users.length}
      </h3>
      <ul className="space-y-1.5">
        {users.map((entry) => (
          <li key={entry.user_id} className="flex items-center gap-2 text-sm text-text-primary">
            <span className="h-2 w-2 shrink-0 bg-toxic" aria-hidden="true" />
            <span>
              {entry.display_name}
              {entry.display_rank && (
                <span className="ml-1 text-xs text-text-secondary">· {entry.display_rank}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
