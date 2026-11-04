"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import type { AllianceTitle, GameRank } from "@/lib/api/types";
import { R4_TITLES, TITLE_LABELS } from "@/lib/identity";

export function RankRequestFields({ rank, title, onRank, onTitle }: {
  rank: GameRank;
  title: AllianceTitle | null;
  onRank: (rank: GameRank) => void;
  onTitle: (title: AllianceTitle | null) => void;
}) {
  const { t, locale } = useTranslation();
  return <>
    <label htmlFor="requested-rank"><Text>{"Your in-game rank (requires approval)"}</Text></label>
    <select id="requested-rank" value={rank} onChange={(event) => {
      const next = event.target.value;
      if (next === "r1" || next === "r2" || next === "r3" || next === "r4" || next === "r5") {
        onRank(next);
        onTitle(next === "r5" ? "alliance_leader" : null);
      }
    }}>{(["r1", "r2", "r3", "r4", "r5"] as const).map((value) => <option key={value} value={value}>{value.toUpperCase()}{value === "r5" ? t(" - Alliance Leader") : ""}</option>)}</select>
    {rank === "r4" && <>
      <label htmlFor="requested-title"><Text>{"R4 title"}</Text></label>
      <select id="requested-title" value={title ?? ""} onChange={(event) => onTitle(R4_TITLES.find((value) => value === event.target.value) ?? null)}>
        <option value=""><Text>{"Officer (no special title)"}</Text></option>
        {R4_TITLES.map((value) => <option key={value} value={value}>{t(TITLE_LABELS[value])}</option>)}
      </select>
    </>}
    {rank === "r5" && <p><Text>{"R5 is automatically titled Alliance Leader, subject to site-admin approval."}</Text></p>}
  </>;
}
