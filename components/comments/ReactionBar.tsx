"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api, apiPost } from "@/lib/api/client";
import type { GuideReactionsPayload, ReactionType } from "@/lib/api/types";

interface ReactionBarProps {
  alliance: string;
  guideSlug: string;
}

const REACTIONS: { type: ReactionType; icon: string; label: string }[] = [
  { type: "fire", icon: "🔥", label: "Fire" },
  { type: "skull", icon: "💀", label: "Skull" },
  { type: "heart", icon: "❤️", label: "Heart" },
  { type: "clap", icon: "👏", label: "Clap" },
];

const ZERO_COUNTS: Record<ReactionType, number> = { fire: 0, skull: 0, heart: 0, clap: 0 };
const NOT_REACTED: Record<ReactionType, boolean> = {
  fire: false,
  skull: false,
  heart: false,
  clap: false,
};

export function ReactionBar({ alliance, guideSlug }: ReactionBarProps) {
  const [counts, setCounts] = useState(ZERO_COUNTS);
  const [reacted, setReacted] = useState(NOT_REACTED);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      const { data } = await api<GuideReactionsPayload>(
        `/api/guides/reactions?alliance=${encodeURIComponent(alliance)}&slug=${encodeURIComponent(guideSlug)}`,
      );
      if (cancelled) return;
      if (!data) {
        setLoading(false);
        setError("Reaction totals are unavailable right now.");
        return;
      }
      setCounts(data.counts);
      setReacted(data.reacted);
      setSignedIn(data.signed_in);
      setLoading(false);
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [alliance, guideSlug]);

  async function handleReact(type: ReactionType) {
    if (!signedIn || reacted[type]) return;

    // Optimistic update + dedup flag set up front, so a fast second click
    // can't double-count while the request is still in flight.
    setReacted((prev) => ({ ...prev, [type]: true }));
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    setError(null);
    const { error: insertError } = await apiPost("/api/guides/reactions", {
      alliance,
      guide_slug: guideSlug,
      reaction_type: type,
    });

    if (insertError) {
      setReacted((prev) => ({ ...prev, [type]: false }));
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
      setError(insertError);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-6">
      <div className="flex flex-wrap gap-2">
      {REACTIONS.map(({ type, icon, label }) => (
        <button
          key={type}
          type="button"
          disabled={loading || !signedIn || reacted[type]}
          onClick={() => handleReact(type)}
          aria-pressed={reacted[type]}
          aria-label={label}
          className={clsx(
            "interactive-lift flex items-center gap-2 border px-3 py-2 text-sm font-medium disabled:cursor-default",
            reacted[type]
              ? "border-accent-bright bg-accent-bright/15 text-accent-bright"
              : "border-border bg-surface text-text-secondary hover:border-accent-bright hover:text-accent-bright",
          )}
        >
          <span aria-hidden="true">{icon}</span>
          <span className="tabular-nums">{counts[type]}</span>
        </button>
      ))}
      </div>
      {!loading && !signedIn && (
        <p className="mt-2 text-xs text-text-secondary">Sign in below to react. Guests can view counts only.</p>
      )}
      {error && <p className="mt-2 text-xs text-warning">{error}</p>}
    </div>
  );
}
