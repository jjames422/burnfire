import type { AllianceTitle, GameRank } from "@/lib/supabase/types";

const RANK_LABELS: Record<GameRank, string> = {
  r1: "R1 Recruit",
  r2: "R2 Member",
  r3: "R3 Elder",
  r4: "R4 Officer",
  r5: "Alliance Leader",
};

const TITLE_LABELS: Record<AllianceTitle, string> = {
  diplomat: "Diplomat",
  recruiter: "Recruiter",
  goddess: "Goddess",
  god_of_war: "God of War",
  alliance_leader: "Alliance Leader",
};

export function formatMemberIdentity({
  inGameName,
  allianceCode,
  gameRank,
  allianceTitle,
}: {
  inGameName: string;
  allianceCode?: string | null;
  gameRank?: GameRank | null;
  allianceTitle?: AllianceTitle | null;
}) {
  if (!allianceCode || !gameRank) return inGameName;

  const standing =
    gameRank === "r5"
      ? "Alliance Leader"
      : gameRank === "r4" && allianceTitle
        ? TITLE_LABELS[allianceTitle]
        : RANK_LABELS[gameRank];

  return `[${allianceCode}] ${inGameName} · ${standing}`;
}
