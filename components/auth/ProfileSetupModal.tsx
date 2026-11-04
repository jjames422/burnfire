"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


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
  const { t, locale } = useTranslation();
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
        <Text>{"Complete your profile"}</Text></h2>
      <p className="mb-4 text-sm text-text-secondary">
        <Text>{"Use the exact name other players see in Last Asylum: Plague."}</Text></p>
      <form onSubmit={handleSubmit}>
        <input
          required
          maxLength={40}
          aria-label={t("Your in-game name")}
          placeholder={t("Your in-game name")}
          value={inGameName}
          onChange={(event) => setInGameName(event.target.value)}
          className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
        />
        <p className="mb-3 text-xs text-text-secondary">
          <Text>{"You'll appear as:"}</Text>{" "}
          <strong className="text-text-primary">
            {inGameName.trim() || t("YourName")}
          </strong>
        </p>
        {error && <p className="mb-3 text-sm text-warning">{t(error)}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="interactive-lift w-full border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t("Saving…") : t("Create community profile")}
        </button>
      </form>
    </div>
  );
}
