"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";

interface ProfileSetupModalProps {
  userId: string;
  onComplete: (profile: ProfileRow) => void;
}

/**
 * One-time first-login step. Only the in-game name is self-reported.
 * Rank, unique title, and permissions are officer-managed membership data.
 */
export function ProfileSetupModal({
  userId,
  onComplete,
}: ProfileSetupModalProps) {
  const [inGameName, setInGameName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError(null);

    // Insert first, then read the committed profile under its SELECT policy.
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      in_game_name: inGameName.trim(),
    });

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    const { data, error: selectError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    setSubmitting(false);

    if (selectError) {
      setError(selectError.message);
      return;
    }

    if (data) onComplete(data);
  }

  return (
    <div className="mx-auto max-w-sm border border-border bg-surface p-6">
      <h2 className="mb-2 font-display text-xl font-semibold text-text-primary">
        Complete your profile
      </h2>
      <p className="mb-4 text-sm text-text-secondary">
        Use the exact name other players see in Last Asylum: Plague.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          required
          maxLength={40}
          aria-label="Your in-game name"
          placeholder="Your in-game name"
          value={inGameName}
          onChange={(event) => setInGameName(event.target.value)}
          className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
        />
        <p className="mb-3 text-xs text-text-secondary">
          You&apos;ll appear as:{" "}
          <strong className="text-text-primary">
            {inGameName.trim() || "YourName"}
          </strong>
        </p>
        {error && <p className="mb-3 text-sm text-warning">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="interactive-lift w-full border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Create community profile"}
        </button>
      </form>
    </div>
  );
}
