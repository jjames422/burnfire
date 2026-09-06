"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ChatMessageRow } from "@/lib/supabase/types";
const QUICK_EMOJI = ["🔥", "❤️", "😂", "👏"];
export function MessageList({
  channelId,
  onReply,
}: {
  channelId: string;
  onReply: (id: string, label: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]),
    [userId, setUserId] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [editBody, setEditBody] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("get_channel_messages", {
      p_channel_id: channelId,
      p_limit: 100,
    });
    setMessages([...(data ?? [])].reverse());
  }, [channelId]);
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
    const c = client
      .channel(`ui:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => load(),
      )
      .subscribe();
    return () => {
      client.removeChannel(c);
    };
  }, [channelId, load]);
  useEffect(
    () => bottom.current?.scrollIntoView({ behavior: "smooth" }),
    [messages.length],
  );
  async function react(m: ChatMessageRow, emoji: string) {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from("message_reactions")
      .select("message_id")
      .eq("message_id", m.id)
      .eq("user_id", userId)
      .eq("emoji", emoji)
      .maybeSingle();
    if (data)
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", m.id)
        .eq("user_id", userId)
        .eq("emoji", emoji);
    else
      await supabase
        .from("message_reactions")
        .insert({ message_id: m.id, user_id: userId, emoji });
    await load();
  }
  async function save(id: string) {
    if (!supabase || !editBody.trim()) return;
    await supabase.rpc("edit_message", {
      p_message_id: id,
      p_body: editBody.trim(),
    });
    setEditing(null);
    await load();
  }
  return (
    <div className="flex-1 space-y-1 overflow-y-auto p-3">
      {messages.length === 0 && (
        <p className="p-3 text-text-secondary">
          No messages yet—start the conversation.
        </p>
      )}
      {messages.map((m) => (
        <article
          key={m.id}
          className={`group px-3 py-2 hover:bg-bg ${m.parent_message_id ? "ml-6 border-l border-border" : ""}`}
        >
          <div className="flex items-baseline gap-2">
            <strong className="text-sm">{m.identity_label}</strong>
            <time className="text-[11px] text-text-secondary">
              {new Date(m.created_at).toLocaleString()}
            </time>
            {m.edited_at && (
              <span className="text-[10px] text-text-secondary">edited</span>
            )}
          </div>
          {editing === m.id ? (
            <div className="flex gap-2">
              <input
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="flex-1 border border-border bg-surface px-2"
              />
              <button onClick={() => save(m.id)}>Save</button>
              <button onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-text-secondary">
              {m.body}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(m.reactions ?? {}).map(([e, n]) => (
              <button
                key={e}
                onClick={() => react(m, e)}
                className="border border-border px-1.5 text-xs"
              >
                {e} {n}
              </button>
            ))}
            <span className="hidden gap-1 group-hover:flex">
              {QUICK_EMOJI.map((e) => (
                <button key={e} onClick={() => react(m, e)}>
                  {e}
                </button>
              ))}
              <button
                onClick={() => onReply(m.id, m.identity_label)}
                className="text-xs"
              >
                Reply
              </button>
              {m.author_id === userId && (
                <button
                  onClick={() => {
                    setEditing(m.id);
                    setEditBody(m.body);
                  }}
                  className="text-xs"
                >
                  Edit
                </button>
              )}
            </span>
          </div>
        </article>
      ))}
      <div ref={bottom} />
    </div>
  );
}
