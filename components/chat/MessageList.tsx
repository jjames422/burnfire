"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/supabase/types";

interface MessageListProps {
  channelId: string;
}

type ProfileInfo = { display_name: string; display_rank: string | null };

/**
 * Fetches recent messages, then subscribes to Realtime Postgres Changes for
 * new inserts on this channel. Message authors are only known by id
 * (messages.author_id -> auth.users, not directly -> profiles, so
 * PostgREST can't embed the join) — profiles for authors are fetched
 * separately and cached by id in a ref, not re-fetched per message.
 */
export function MessageList({ channelId }: MessageListProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const knownProfileIds = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    knownProfileIds.current = new Set();
    setMessages([]);
    setProfiles({});
    setLoading(true);

    async function loadProfilesFor(authorIds: string[]) {
      const missing = authorIds.filter((id) => !knownProfileIds.current.has(id));
      if (missing.length === 0) return;
      missing.forEach((id) => knownProfileIds.current.add(id));

      const { data } = await client.from("profiles").select("id, display_name, display_rank").in("id", missing);

      if (cancelled || !data) return;
      setProfiles((prev) => {
        const next = { ...prev };
        for (const row of data) {
          next[row.id] = { display_name: row.display_name, display_rank: row.display_rank };
        }
        return next;
      });
    }

    async function load() {
      const { data } = await client
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (cancelled) return;
      if (data) {
        setMessages(data);
        await loadProfilesFor([...new Set(data.map((message) => message.author_id))]);
      }
      setLoading(false);
    }

    load();

    const realtimeChannel = client
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const message = payload.new as MessageRow;
          setMessages((prev) => [...prev, message]);
          loadProfilesFor([message.author_id]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(realtimeChannel);
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (loading) return <p className="flex-1 p-4 text-text-secondary">Loading messages…</p>;

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {messages.length === 0 && <p className="text-text-secondary">No messages yet — say something.</p>}
      {messages.map((message) => {
        const profile = profiles[message.author_id];
        return (
          <div key={message.id}>
            <p className="text-sm">
              <span className="font-display font-semibold text-text-primary">
                {profile?.display_name ?? "…"}
              </span>
              {profile?.display_rank && (
                <span className="ml-1 text-xs text-text-secondary">· {profile.display_rank}</span>
              )}
              <span className="ml-2 text-xs text-text-secondary/70">
                {new Date(message.created_at).toLocaleTimeString()}
              </span>
            </p>
            <p className="text-sm whitespace-pre-wrap text-text-secondary">{message.body}</p>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
