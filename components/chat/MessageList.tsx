"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ChatMessageRow } from "@/lib/supabase/types";

const QUICK_EMOJI = ["🔥", "❤️", "😂", "👏"];

export function MessageList({ channelId, onReply }: { channelId: string; onReply: (id: string, label: string) => void }) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("get_channel_messages", { p_channel_id: channelId, p_limit: 100 });
    setMessages([...(data ?? [])].reverse());
  }, [channelId]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
    const channel = client.channel(`ui:${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, load)
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [channelId, load]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [messages.length]);

  async function react(message: ChatMessageRow, emoji: string) {
    if (!supabase || !userId) return;
    const { data } = await supabase.from("message_reactions").select("message_id").eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji).maybeSingle();
    if (data) await supabase.from("message_reactions").delete().eq("message_id", message.id).eq("user_id", userId).eq("emoji", emoji);
    else await supabase.from("message_reactions").insert({ message_id: message.id, user_id: userId, emoji });
    await load();
  }

  async function save(id: string) {
    if (!supabase || !editBody.trim()) return;
    await supabase.rpc("edit_message", { p_message_id: id, p_body: editBody.trim() });
    setEditing(null);
    await load();
  }

  return (
    <div className="message-stream">
      {messages.length === 0 && <div className="channel-welcome"><span>#</span><h3>This channel is ready.</h3><p>Start the first transmission and bring the survivors together.</p></div>}
      {messages.map((message) => (
        <article key={message.id} className={`message-row ${message.parent_message_id ? "is-reply" : ""}`}>
          <div className="avatar-flame">{message.identity_label.slice(0, 1).toUpperCase()}</div>
          <div className="message-copy">
            <div className="message-meta"><strong>{message.identity_label}</strong><time>{new Date(message.created_at).toLocaleString()}</time>{message.edited_at && <span>edited</span>}</div>
            {editing === message.id ? <div className="edit-row"><input value={editBody} onChange={(event) => setEditBody(event.target.value)} /><button onClick={() => save(message.id)}>Save</button><button onClick={() => setEditing(null)}>Cancel</button></div> : <p>{message.body}</p>}
            <div className="reaction-row">
              {Object.entries(message.reactions ?? {}).map(([emoji, total]) => <button key={emoji} onClick={() => react(message, emoji)} className="reaction-chip">{emoji} {total}</button>)}
            </div>
          </div>
          <div className="message-actions">{QUICK_EMOJI.map((emoji) => <button key={emoji} onClick={() => react(message, emoji)}>{emoji}</button>)}<button onClick={() => onReply(message.id, message.identity_label)}>↩</button>{message.author_id === userId && <button onClick={() => { setEditing(message.id); setEditBody(message.body); }}>✎</button>}</div>
        </article>
      ))}
      <div ref={bottom} />
    </div>
  );
}
