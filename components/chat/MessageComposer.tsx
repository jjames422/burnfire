"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
export function MessageComposer({
  channelId,
  replyTo,
  onCancelReply,
  onSent,
}: {
  channelId: string;
  replyTo: { id: string; label: string } | null;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !body.trim()) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.rpc("post_channel_message", {
      p_channel_id: channelId,
      p_body: body.trim(),
      p_parent_message_id: replyTo?.id ?? null,
      p_mentioned_user_ids: [],
    });
    setSending(false);
    if (error) setError(error.message);
    else {
      setBody("");
      onSent();
    }
  }
  return (
    <form onSubmit={submit} className="border-t border-border p-3">
      {replyTo && (
        <div className="mb-2 flex justify-between text-xs text-text-secondary">
          <span>Replying to {replyTo.label}</span>
          <button type="button" onClick={onCancelReply}>
            Cancel
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          rows={1}
          maxLength={2000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Message…"
          className="min-h-10 flex-1 resize-none border border-border bg-bg px-3 py-2 text-sm"
        />
        <button
          disabled={sending}
          className="bg-accent px-4 py-2 font-semibold disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-warning">{error}</p>}
    </form>
  );
}
