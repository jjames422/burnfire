"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ChatMessageRow } from "@/lib/supabase/types";

const QUICK_EMOJI = ["🔥", "❤️", "😂", "👏"];

export function MessageList({ channelId, refreshVersion, onReply }: { channelId: string; refreshVersion: number; onReply: (id: string, label: string) => void }) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data }, { data: pins }] = await Promise.all([
      supabase.rpc("get_channel_messages", { p_channel_id: channelId, p_limit: 100 }),
      supabase.from("pinned_messages").select("message_id").eq("channel_id", channelId),
    ]);
    setMessages([...(data ?? [])].reverse());
    setPinnedIds(new Set((pins ?? []).map((pin) => pin.message_id)));
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

  useEffect(() => { load(); }, [refreshVersion, load]);

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

  async function remove(id: string) {
    if (!supabase || !window.confirm("Delete this message? This cannot be undone in chat.")) return;
    const { error } = await supabase.rpc("delete_message", { p_message_id: id });
    if (!error) await load();
  }

  async function copyText(message: ChatMessageRow) {
    await navigator.clipboard.writeText(message.body);
    setStatus("Message text copied.");
    setOpenMenu(null);
  }

  async function copyLink(message: ChatMessageRow) {
    const link = `${window.location.origin}/chat?channel=${channelId}&message=${message.id}`;
    await navigator.clipboard.writeText(link);
    setStatus("Message link copied.");
    setOpenMenu(null);
  }

  function markUnread(message: ChatMessageRow) {
    window.localStorage.setItem(`chat-unread:${channelId}`, message.id);
    setStatus("Marked unread from this message on this device.");
    setOpenMenu(null);
  }

  async function pin(message: ChatMessageRow) {
    if (!supabase) return;
    const shouldPin = !pinnedIds.has(message.id);
    const { error } = await supabase.rpc("pin_message", { p_message_id: message.id, p_pin: shouldPin });
    setOpenMenu(null);
    if (error) setStatus(`Pin unavailable: ${error.message}`);
    else { setStatus(shouldPin ? "Message pinned." : "Message unpinned."); await load(); }
  }

  async function report(message: ChatMessageRow) {
    if (!supabase || !userId) return;
    const reason = window.prompt("Why are you reporting this message? Please provide at least 3 characters.");
    if (!reason) return;
    if (reason.trim().length < 3) { setStatus("Please give a little more detail before submitting a report."); return; }
    const { error } = await supabase.from("content_reports").insert({ reporter_id: userId, target_type: "message", target_id: message.id, reason: reason.trim() });
    setOpenMenu(null);
    setStatus(error ? `Report was not submitted: ${error.message}` : "Report sent privately to the moderation team.");
  }

  return (
    <div className="message-stream" onClick={() => openMenu && setOpenMenu(null)}>
      {status && <button className="chat-status" onClick={() => setStatus(null)}>{status}<span>×</span></button>}
      {messages.length === 0 && <div className="channel-welcome"><span>#</span><h3>This channel is ready.</h3><p>Start the first transmission and bring the survivors together.</p></div>}
      {messages.map((message) => (
        <article id={`message-${message.id}`} key={message.id} className={`message-row ${message.parent_message_id ? "is-reply" : ""} ${pinnedIds.has(message.id) ? "is-pinned" : ""}`}>
          <div className="avatar-flame">{message.identity_label.slice(0, 1).toUpperCase()}</div>
          <div className="message-copy">
            <div className="message-meta"><strong>{message.identity_label}</strong><time>{new Date(message.created_at).toLocaleString()}</time>{message.edited_at && <span>edited</span>}{pinnedIds.has(message.id) && <span className="pin-label">◆ Pinned</span>}</div>
            {editing === message.id ? <div className="edit-row"><input value={editBody} onChange={(event) => setEditBody(event.target.value)} /><button onClick={() => save(message.id)}>Save</button><button onClick={() => setEditing(null)}>Cancel</button></div> : <p>{message.body}</p>}
            <div className="reaction-row">
              {Object.entries(message.reactions ?? {}).map(([emoji, total]) => <button key={emoji} onClick={() => react(message, emoji)} className="reaction-chip">{emoji} {total}</button>)}
            </div>
          </div>
          <div className="message-actions">{QUICK_EMOJI.map((emoji) => <button key={emoji} onClick={() => react(message, emoji)} title={`React ${emoji}`}>{emoji}</button>)}<button onClick={() => onReply(message.id, message.identity_label)} title="Reply">↩</button><button onClick={(event) => { event.stopPropagation(); setOpenMenu(openMenu === message.id ? null : message.id); }} title="More actions">•••</button>{message.author_id === userId && <><button onClick={() => { setEditing(message.id); setEditBody(message.body); }} title="Edit">✎</button><button onClick={() => remove(message.id)} title="Delete">⌫</button></>}</div>
          {openMenu === message.id && <div className="message-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => copyText(message)}>Copy text</button>
            <button onClick={() => copyLink(message)}>Copy message link</button>
            <button onClick={() => { onReply(message.id, message.identity_label); setOpenMenu(null); }}>Reply</button>
            <button onClick={() => markUnread(message)}>Mark unread</button>
            <button onClick={() => pin(message)}>{pinnedIds.has(message.id) ? "Unpin message" : "Pin message"}</button>
            <button className="danger" onClick={() => report(message)}>Report message</button>
          </div>}
        </article>
      ))}
      <div ref={bottom} />
    </div>
  );
}
