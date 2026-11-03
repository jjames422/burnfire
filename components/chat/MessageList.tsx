"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiPost } from "@/lib/api/client";
import { useChannelStream } from "@/lib/api/stream";
import type { ChannelMessagesPayload, ChatAttachmentInfo, ChatMessageRow, SessionInfo } from "@/lib/api/types";

const QUICK_EMOJI = ["🔥", "❤️", "😂", "👏"];

export function MessageList({ channelId, refreshVersion, onReply }: { channelId: string; refreshVersion: number; onReply: (id: string, label: string) => void }) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Map<string, ChatAttachmentInfo[]>>(new Map());
  const [reportMessage, setReportMessage] = useState<ChatMessageRow | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const { data } = await api<ChannelMessagesPayload>(`/api/channels/${channelId}/messages`);
    if (!data) return;
    setMessages([...data.messages].reverse());
    setPinnedIds(new Set(data.pinned_message_ids));
    setAttachments(data.attachments.reduce((map, item) => {
      const current = map.get(item.message_id) ?? [];
      map.set(item.message_id, [...current, item]);
      return map;
    }, new Map<string, ChatAttachmentInfo[]>()));
  }, [channelId]);

  useEffect(() => {
    api<SessionInfo>("/api/auth/session").then(({ data }) => setUserId(data?.user?.id ?? null));
    load();
  }, [channelId, load]);

  useChannelStream(channelId, useCallback((event) => {
    if (event.type === "message") load();
  }, [load]));

  useEffect(() => { load(); }, [refreshVersion, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function react(message: ChatMessageRow, emoji: string) {
    if (!userId) return;
    await apiPost(`/api/messages/${message.id}/reactions`, { emoji });
    await load();
  }

  async function save(id: string) {
    if (!editBody.trim()) return;
    await api(`/api/messages/${id}`, { method: "PATCH", body: JSON.stringify({ body: editBody.trim() }) });
    setEditing(null);
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this message? This cannot be undone in chat.")) return;
    const { error } = await api(`/api/messages/${id}`, { method: "DELETE" });
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
    const shouldPin = !pinnedIds.has(message.id);
    const { error } = await apiPost(`/api/messages/${message.id}/pin`, { pin: shouldPin });
    setOpenMenu(null);
    if (error) setStatus(`Pin unavailable: ${error}`);
    else { setStatus(shouldPin ? "Message pinned." : "Message unpinned."); await load(); }
  }

  function beginReport(message: ChatMessageRow) {
    setReportMessage(message);setReportReason("");setReportError(null);setOpenMenu(null);
  }

  async function submitReport() {
    const message=reportMessage;
    if(!message||reportReason.trim().length<3){setReportError("Please explain the problem in at least 3 characters.");return;}
    const { error } = await apiPost("/api/reports", { target_type: "message", target_id: message.id, reason: reportReason.trim() });
    if(error)setReportError(error);else{setReportMessage(null);setStatus("Report sent privately to the moderation team.");}
  }

  const threadRoot=messages.find((message)=>message.id===threadRootId)??null;
  const threadReplies=threadRootId?messages.filter((message)=>message.parent_message_id===threadRootId||message.thread_root_id===threadRootId):[];

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
            {(attachments.get(message.id)??[]).map((attachment)=><a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className={`message-attachment ${attachment.mime_type.startsWith("image/")?"is-image":""}`}>{attachment.mime_type.startsWith("image/")&&attachment.url?<img src={attachment.url} alt={attachment.file_name}/>:<span>◆</span>}<div><strong>{attachment.file_name}</strong><small>{(attachment.size_bytes/1024/1024).toFixed(2)} MB</small></div></a>)}
            <div className="reaction-row">
              {Object.entries(message.reactions ?? {}).map(([emoji, total]) => <button key={emoji} onClick={() => react(message, emoji)} className="reaction-chip">{emoji} {total}</button>)}
            </div>
            {!message.parent_message_id&&messages.some((reply)=>reply.parent_message_id===message.id||reply.thread_root_id===message.id)&&<button className="thread-link" onClick={()=>setThreadRootId(message.id)}>{messages.filter((reply)=>reply.parent_message_id===message.id||reply.thread_root_id===message.id).length} replies · View thread</button>}
          </div>
          <div className="message-actions">{QUICK_EMOJI.map((emoji) => <button key={emoji} onClick={() => react(message, emoji)} title={`React ${emoji}`}>{emoji}</button>)}<button onClick={() => onReply(message.id, message.identity_label)} title="Reply">↩</button><button onClick={(event) => { event.stopPropagation(); setOpenMenu(openMenu === message.id ? null : message.id); }} title="More actions">•••</button>{message.author_id === userId && <><button onClick={() => { setEditing(message.id); setEditBody(message.body); }} title="Edit">✎</button><button onClick={() => remove(message.id)} title="Delete">⌫</button></>}</div>
          {openMenu === message.id && <div className="message-menu" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => copyText(message)}>Copy text</button>
            <button onClick={() => copyLink(message)}>Copy message link</button>
            <button onClick={() => { onReply(message.id, message.identity_label); setOpenMenu(null); }}>Reply</button>
            <button onClick={() => markUnread(message)}>Mark unread</button>
            <button onClick={() => pin(message)}>{pinnedIds.has(message.id) ? "Unpin message" : "Pin message"}</button>
            <button className="danger" onClick={() => beginReport(message)}>Report message</button>
          </div>}
        </article>
      ))}
      {threadRoot&&<aside className="thread-panel"><header><div><span className="eyebrow">Thread</span><h3>{threadReplies.length} {threadReplies.length===1?"reply":"replies"}</h3></div><button onClick={()=>setThreadRootId(null)}>×</button></header><article className="thread-origin"><strong>{threadRoot.identity_label}</strong><p>{threadRoot.body}</p></article><div className="thread-replies">{threadReplies.map((reply)=><article key={reply.id}><div className="avatar-flame">{reply.identity_label.slice(0,1).toUpperCase()}</div><div><strong>{reply.identity_label}</strong><time>{new Date(reply.created_at).toLocaleString()}</time><p>{reply.body}</p></div></article>)}</div><button className="thread-reply" onClick={()=>onReply(threadRoot.id,threadRoot.identity_label)}>Reply in thread</button></aside>}
      {reportMessage&&<div className="report-backdrop" role="presentation" onClick={()=>setReportMessage(null)}><section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event)=>event.stopPropagation()}><span className="eyebrow">Private moderation report</span><h3 id="report-title">Report this message?</h3><blockquote>{reportMessage.body}</blockquote><label>What went wrong?</label><textarea autoFocus maxLength={500} value={reportReason} onChange={(event)=>{setReportReason(event.target.value);setReportError(null);}} placeholder="Spam, harassment, unsafe content, or another concern"/><small>{reportReason.length}/500</small>{reportError&&<p className="utility-error">{reportError}</p>}<div><button className="ghost-button" onClick={()=>setReportMessage(null)}>Cancel</button><button className="report-submit" onClick={submitReport}>Send private report</button></div></section></div>}
      <div ref={bottom} />
    </div>
  );
}
