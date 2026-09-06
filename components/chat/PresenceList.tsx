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
  rank_label: string;
}

const RANK_LABELS = { r1: "R1 · Recruit", r2: "R2 · Member", r3: "R3 · Elder", r4: "R4 · Officer", r5: "R5 · Alliance Leader" } as const;
const TITLE_LABELS = { diplomat: "Diplomat", recruiter: "Recruiter", goddess: "Goddess", god_of_war: "God of War", alliance_leader: "Alliance Leader" } as const;

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

      const [{ data: profile }, { data: membership }] = await Promise.all([
        client.from("profiles").select("display_name").eq("id", user.id).single(),
        client
          .from("alliance_members")
          .select("game_rank, alliance_title")
          .eq("alliance", alliance)
          .eq("user_id", user.id)
          .single(),
      ]);

      if (cancelled) return;

      const presenceChannel = client.channel(`presence:${alliance}:${channelSlug}`, {
        config: { private: true, presence: { key: user.id } },
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
              rank_label: membership
                ? `${RANK_LABELS[membership.game_rank]}${membership.alliance_title ? ` · ${TITLE_LABELS[membership.alliance_title]}` : ""}`
                : "Unverified",
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
              {entry.rank_label && (
                <span className="ml-1 text-xs text-text-secondary">· {entry.rank_label}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
