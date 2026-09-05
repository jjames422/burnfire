"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";

interface MessageComposerProps {
  channelId: string;
}

/**
 * No optimistic local append here — the message we just inserted comes back
 * through the same Realtime subscription MessageList is already using, so
 * there's one source of truth instead of a local copy that could drift.
 */
export function MessageComposer({ channelId }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !body.trim()) return;

    setSending(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSending(false);
      setError("Not signed in.");
      return;
    }

    const { error: insertError } = await supabase.from("messages").insert({
      channel_id: channelId,
      author_id: user.id,
      body: body.trim(),
    });

    setSending(false);

    if (insertError) setError(insertError.message);
    else setBody("");
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="flex gap-2">
        <input
          required
          maxLength={2000}
          placeholder="Message…"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="flex-1 border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending}
          className="interactive-lift border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-warning">{error}</p>}
    </form>
  );
}
