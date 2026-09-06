"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/supabase/types";
import { formatMemberIdentity } from "@/lib/identity";

interface MessageListProps {
  channelId: string;
  alliance: string;
}

type ProfileInfo = { identity_label: string };

/**
 * Fetches recent messages, then subscribes to Realtime Postgres Changes for
 * new inserts on this channel. Message authors are only known by id
 * (messages.author_id -> auth.users, not directly -> profiles, so
 * PostgREST can't embed the join) — profiles for authors are fetched
 * separately and cached by id in a ref, not re-fetched per message.
 */
export function MessageList({ channelId, alliance }: MessageListProps) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [loading, setLoading] = useState(true);
  const knownProfileIds = useRef(new Set<string>());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const shouldFollowRef = useRef(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    knownProfileIds.current = new Set();
    setMessages([]);
    setProfiles({});
    setLoading(true);

    async function loadProfilesFor(authorIds: string[]) {
      const missing = authorIds.filter(
        (id) => !knownProfileIds.current.has(id),
      );
      if (missing.length === 0) return;
      const [
        { data, error },
        { data: memberships, error: membershipError },
        { data: allianceRecord, error: allianceError },
      ] = await Promise.all([
        client.from("profiles").select("id, in_game_name").in("id", missing),
        client
          .from("alliance_members")
          .select("user_id, game_rank, alliance_title")
          .eq("alliance", alliance)
          .in("user_id", missing),
        client.from("alliances").select("code").eq("slug", alliance).single(),
      ]);

      if (
        cancelled ||
        error ||
        membershipError ||
        allianceError ||
        !data ||
        !memberships
      )
        return;
      data.forEach((row) => knownProfileIds.current.add(row.id));
      const membershipByUser = new Map(
        memberships.map((row) => [row.user_id, row]),
      );
      setProfiles((prev) => {
        const next = { ...prev };
        for (const row of data) {
          const membership = membershipByUser.get(row.id);
          next[row.id] = {
            identity_label: formatMemberIdentity({
              inGameName: row.in_game_name,
              allianceCode: membership ? allianceRecord?.code : null,
              gameRank: membership?.game_rank,
              allianceTitle: membership?.alliance_title,
            }),
          };
        }
        return next;
      });
    }

    async function load() {
      const { data } = await client
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (data) {
        const chronological = [...data].reverse();
        setMessages(chronological);
        await loadProfilesFor([
          ...new Set(chronological.map((message) => message.author_id)),
        ]);
      }
      setLoading(false);
    }

    load();

    const realtimeChannel = client
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const message = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((item) => item.id === message.id)) return prev;
            return [...prev, message];
          });
          if (!shouldFollowRef.current) setUnreadCount((count) => count + 1);
          loadProfilesFor([message.author_id]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      client.removeChannel(realtimeChannel);
    };
  }, [alliance, channelId]);

  useEffect(() => {
    if (shouldFollowRef.current)
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const nearBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    shouldFollowRef.current = nearBottom;
    if (nearBottom) setUnreadCount(0);
  }

  function jumpToLatest() {
    shouldFollowRef.current = true;
    setUnreadCount(0);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  if (loading)
    return <p className="flex-1 p-4 text-text-secondary">Loading messages…</p>;

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="relative flex-1 space-y-3 overflow-y-auto p-4"
    >
      {messages.length === 0 && (
        <p className="text-text-secondary">No messages yet — say something.</p>
      )}
      {messages.map((message) => {
        const profile = profiles[message.author_id];
        return (
          <div key={message.id}>
            <p className="text-sm">
              <span className="font-display font-semibold text-text-primary">
                {profile?.identity_label ?? "…"}
              </span>
              <span className="ml-2 text-xs text-text-secondary/70">
                {new Date(message.created_at).toLocaleTimeString()}
              </span>
            </p>
            <p className="text-sm whitespace-pre-wrap text-text-secondary">
              {message.body}
            </p>
          </div>
        );
      })}
      <div ref={bottomRef} />
      {unreadCount > 0 && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="sticky bottom-2 left-1/2 -translate-x-1/2 border border-accent bg-bg px-3 py-1.5 text-xs font-semibold text-accent-bright shadow-lg"
        >
          {unreadCount} new {unreadCount === 1 ? "message" : "messages"}
        </button>
      )}
    </div>
  );
}
