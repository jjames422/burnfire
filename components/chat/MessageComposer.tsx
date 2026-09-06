"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

interface ComposerProps {
  channelId: string;
  channelName: string;
  replyTo: { id: string; label: string } | null;
  onCancelReply: () => void;
  onSent: () => void;
}

export function MessageComposer({ channelId, channelName, replyTo, onCancelReply, onSent }: ComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !body.trim()) return;
    setSending(true);
    setError(null);
    const { error: sendError } = await supabase.rpc("post_channel_message", {
      p_channel_id: channelId,
      p_body: body.trim(),
      p_parent_message_id: replyTo?.id ?? null,
      p_mentioned_user_ids: [],
    });
    setSending(false);
    if (sendError) setError(sendError.message);
    else { setBody(""); onSent(); }
  }

  return (
    <form onSubmit={submit} className="composer-wrap">
      {replyTo && <div className="reply-banner"><span>Replying to <strong>{replyTo.label}</strong></span><button type="button" onClick={onCancelReply}>×</button></div>}
      <div className="composer-box">
        <button type="button" className="composer-tool" title="Attachments coming next">＋</button>
        <textarea rows={1} maxLength={2000} required value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Message #${channelName}`} />
        <button type="button" className="composer-tool" title="Emoji">☺</button>
        <button disabled={sending} className="send-button"><span>{sending ? "…" : "➤"}</span><span className="sr-only">Send</span></button>
      </div>
      <div className="composer-foot"><span>Community rules apply</span><span>{body.length}/2000</span></div>
      {error && <p className="composer-error">{error}</p>}
    </form>
  );
}
