"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import clsx from "clsx";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { GuideReactionRow, ReactionRow, ReactionType } from "@/lib/supabase/types";

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
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCounts() {
      const { data: authData } = await supabase!.auth.getUser();
      if (cancelled) return;
      setUser(authData.user ?? null);

      const [{ data }, { data: ownReactions }] = await Promise.all([
        supabase!
        .from("reactions")
        .select("*")
        .eq("alliance", alliance)
        .eq("guide_slug", guideSlug),
        authData.user
          ? supabase!
              .from("guide_reactions")
              .select("*")
              .eq("alliance", alliance)
              .eq("guide_slug", guideSlug)
              .eq("user_id", authData.user.id)
          : Promise.resolve({ data: [] as GuideReactionRow[] }),
      ]);

      if (cancelled) return;

      if (!data) {
        setLoading(false);
        setError("Reaction totals are unavailable right now.");
        return;
      }

      setCounts((prev) => {
        const next = { ...prev };
        for (const row of data as ReactionRow[]) {
          next[row.reaction_type] = row.count;
        }
        return next;
      });
      setReacted((prev) => {
        const next = { ...prev };
        for (const row of (ownReactions ?? []) as GuideReactionRow[]) next[row.reaction_type] = true;
        return next;
      });
      setLoading(false);
    }

    loadCounts();
    return () => {
      cancelled = true;
    };
  }, [alliance, guideSlug]);

  async function handleReact(type: ReactionType) {
    if (!supabase || !user || reacted[type]) return;

    // Optimistic update + dedup flag set up front, so a fast second click
    // can't double-count while the request is still in flight.
    setReacted((prev) => ({ ...prev, [type]: true }));
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    setError(null);
    const { error: insertError } = await supabase.from("guide_reactions").insert({
      alliance,
      guide_slug: guideSlug,
      reaction_type: type,
      user_id: user.id,
    });

    if (insertError) {
      setReacted((prev) => ({ ...prev, [type]: false }));
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
      setError(insertError.message);
    }
  }

  if (!isSupabaseConfigured) return null;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-6">
      <div className="flex flex-wrap gap-2">
      {REACTIONS.map(({ type, icon, label }) => (
        <button
          key={type}
          type="button"
          disabled={loading || !user || reacted[type]}
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
      {!loading && !user && (
        <p className="mt-2 text-xs text-text-secondary">Sign in below to react. Guests can view counts only.</p>
      )}
      {error && <p className="mt-2 text-xs text-warning">{error}</p>}
    </div>
  );
}
