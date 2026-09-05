"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ReactionRow, ReactionType } from "@/lib/supabase/types";

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

function storageKey(alliance: string, guideSlug: string, type: ReactionType) {
  return `reacted:${alliance}:${guideSlug}:${type}`;
}

export function ReactionBar({ alliance, guideSlug }: ReactionBarProps) {
  const [counts, setCounts] = useState(ZERO_COUNTS);
  const [reacted, setReacted] = useState(NOT_REACTED);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dedup flags live in localStorage — cosmetic only (see schema.sql
    // comment on increment_reaction), so this only ever affects this browser.
    setReacted({
      fire: Boolean(localStorage.getItem(storageKey(alliance, guideSlug, "fire"))),
      skull: Boolean(localStorage.getItem(storageKey(alliance, guideSlug, "skull"))),
      heart: Boolean(localStorage.getItem(storageKey(alliance, guideSlug, "heart"))),
      clap: Boolean(localStorage.getItem(storageKey(alliance, guideSlug, "clap"))),
    });

    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCounts() {
      const { data } = await supabase!
        .from("reactions")
        .select("*")
        .eq("alliance", alliance)
        .eq("guide_slug", guideSlug);

      if (cancelled || !data) return;

      setCounts((prev) => {
        const next = { ...prev };
        for (const row of data as ReactionRow[]) {
          next[row.reaction_type] = row.count;
        }
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
    if (!supabase || reacted[type]) return;

    // Optimistic update + dedup flag set up front, so a fast second click
    // can't double-count while the request is still in flight.
    setReacted((prev) => ({ ...prev, [type]: true }));
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    localStorage.setItem(storageKey(alliance, guideSlug, type), "1");

    const { error } = await supabase.rpc("increment_reaction", {
      p_alliance: alliance,
      p_guide_slug: guideSlug,
      p_reaction_type: type,
    });

    if (error) {
      setReacted((prev) => ({ ...prev, [type]: false }));
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
      localStorage.removeItem(storageKey(alliance, guideSlug, type));
    }
  }

  if (!isSupabaseConfigured) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-2 px-6 pt-6">
      {REACTIONS.map(({ type, icon, label }) => (
        <button
          key={type}
          type="button"
          disabled={loading || reacted[type]}
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
  );
}
