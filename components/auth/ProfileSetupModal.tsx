"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";

interface ProfileSetupModalProps {
  alliance: string;
  userId: string;
  onComplete: (profile: ProfileRow) => void;
}

/**
 * One-time first-login step. Only display_name/display_rank are collected
 * here — permission_role is never sent from the client at all, so there's
 * nothing for a user to tamper with even before the insert-policy check
 * (see schema.sql) rejects anything but 'member'.
 */
export function ProfileSetupModal({ alliance, userId, onComplete }: ProfileSetupModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [displayRank, setDisplayRank] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError(null);

    // Deliberately not `.insert(...).select().single()` — chaining .select()
    // makes Postgres also satisfy the SELECT policy via RETURNING, in the
    // same statement as the insert. Our SELECT policy checks
    // `alliance = my_alliance()`, which itself queries profiles — a
    // self-referential check against the row being inserted, in the same
    // statement. That combination is a known rough RLS edge that can fail
    // even though the insert itself succeeds, and Postgres reports it with
    // the exact same "new row violates row-level security policy" message
    // as a real WITH CHECK failure. Splitting into a plain insert (only
    // needs the INSERT policy) plus a separate follow-up select (evaluated
    // fresh, after the row is already committed) avoids it entirely.
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      alliance,
      display_name: displayName.trim(),
      display_rank: displayRank.trim() || null,
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
        One-time setup — this is how you&apos;ll show up in chat.
      </p>
      <form onSubmit={handleSubmit}>
        <input
          required
          maxLength={40}
          placeholder="In-game name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
        />
        <input
          maxLength={40}
          placeholder="Rank / title (optional)"
          value={displayRank}
          onChange={(event) => setDisplayRank(event.target.value)}
          className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
        />
        {error && <p className="mb-3 text-sm text-warning">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="interactive-lift w-full border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Enter chat"}
        </button>
      </form>
    </div>
  );
}
