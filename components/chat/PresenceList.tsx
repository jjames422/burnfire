"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { formatMemberIdentity } from "@/lib/identity";

interface PresenceListProps {
  alliance: string;
  channelSlug: string;
}

interface PresenceEntry {
  user_id: string;
  identity_label: string;
}

/**
 * Realtime Presence, not a table — per-channel topic
 * `presence:<alliance>:<channel-slug>`. The channel is private and the
 * matching realtime.messages policies authorize both listening and tracking.
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

      await client.realtime.setAuth();

      const [
        { data: profile },
        { data: membership },
        { data: allianceRecord },
      ] = await Promise.all([
        client
          .from("profiles")
          .select("in_game_name")
          .eq("id", user.id)
          .single(),
        client
          .from("alliance_members")
          .select("game_rank, alliance_title")
          .eq("alliance", alliance)
          .eq("user_id", user.id)
          .single(),
        client.from("alliances").select("code").eq("slug", alliance).single(),
      ]);

      if (cancelled) return;

      const presenceChannel = client.channel(
        `presence:${alliance}:${channelSlug}`,
        {
          config: { private: true, presence: { key: user.id } },
        },
      );

      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel.presenceState<PresenceEntry>();
          setUsers(Object.values(state).flat());
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && !cancelled) {
            await presenceChannel.track({
              user_id: user.id,
              identity_label: formatMemberIdentity({
                inGameName: profile?.in_game_name ?? "Unknown",
                allianceCode: membership ? allianceRecord?.code : null,
                gameRank: membership?.game_rank,
                allianceTitle: membership?.alliance_title,
              }),
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
    <aside className="presence-rail">
      <h3>Online <span>{users.length}</span></h3>
      <ul>
        {users.map((entry) => (
          <li key={entry.user_id}>
            <span className="presence-avatar">{entry.identity_label.slice(0, 1).toUpperCase()}<i /></span>
            <span>{entry.identity_label}<small>Online</small></span>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p>The fire is quiet.<br />Others will appear here.</p>}
    </aside>
  );
}
