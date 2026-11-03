"use client";

import { useState, type SubmitEvent } from "react";
import { apiPost } from "@/lib/api/client";
import type { ProfileRow } from "@/lib/api/types";

interface ProfileSetupModalProps {
  onComplete: (profile: ProfileRow) => void;
}

/**
 * One-time first-login step. Only the in-game name is self-reported.
 * Rank, unique title, and permissions are officer-managed membership data.
 */
export function ProfileSetupModal({ onComplete }: ProfileSetupModalProps) {
  const [inGameName, setInGameName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: createError } = await apiPost<{ profile: ProfileRow }>(
      "/api/profile",
      { in_game_name: inGameName.trim() },
    );

    setSubmitting(false);
    if (createError || !data?.profile) {
      setError(createError ?? "Profile could not be created.");
      return;
    }
    onComplete(data.profile);
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
