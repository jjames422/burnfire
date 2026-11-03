"use client";

import type { AllianceTitle, GameRank } from "@/lib/api/types";
import { R4_TITLES, TITLE_LABELS } from "@/lib/identity";

export function RankRequestFields({ rank, title, onRank, onTitle }: {
  rank: GameRank;
  title: AllianceTitle | null;
  onRank: (rank: GameRank) => void;
  onTitle: (title: AllianceTitle | null) => void;
}) {
  return <>
    <label htmlFor="requested-rank">Your in-game rank (requires approval)</label>
    <select id="requested-rank" value={rank} onChange={(event) => {
      const next = event.target.value;
      if (next === "r1" || next === "r2" || next === "r3" || next === "r4" || next === "r5") {
        onRank(next);
        onTitle(next === "r5" ? "alliance_leader" : null);
      }
    }}>{(["r1", "r2", "r3", "r4", "r5"] as const).map((value) => <option key={value} value={value}>{value.toUpperCase()}{value === "r5" ? " - Alliance Leader" : ""}</option>)}</select>
    {rank === "r4" && <>
      <label htmlFor="requested-title">R4 title</label>
      <select id="requested-title" value={title ?? ""} onChange={(event) => onTitle(R4_TITLES.find((value) => value === event.target.value) ?? null)}>
        <option value="">Officer (no special title)</option>
        {R4_TITLES.map((value) => <option key={value} value={value}>{TITLE_LABELS[value]}</option>)}
      </select>
    </>}
    {rank === "r5" && <p>R5 is automatically titled Alliance Leader, subject to site-admin approval.</p>}
  </>;
}
