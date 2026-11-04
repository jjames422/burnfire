import type { AllianceTitle, GameRank } from "@/lib/api/types";

const RANK_LABELS: Record<GameRank, string> = {
  r1: "R1 Recruit",
  r2: "R2 Member",
  r3: "R3 Elder",
  r4: "R4 Officer",
  r5: "Alliance Leader",
};

export const TITLE_LABELS: Record<AllianceTitle, string> = {
  diplomat: "Diplomat",
  recruiter: "Recruiter",
  goddess: "Goddess",
  god_of_war: "God of War",
  alliance_leader: "Alliance Leader",
};

export const R4_TITLES = ["diplomat", "recruiter", "goddess", "god_of_war"] as const;

export function validTitleForRank(rank: GameRank, title: unknown): title is AllianceTitle | null {
  if (rank === "r5") return title === "alliance_leader";
  if (rank === "r4") return title === null || R4_TITLES.some((value) => value === title);
  return title === null;
}

export function formatMemberIdentity({
  inGameName,
  allianceCode,
  gameRank,
  allianceTitle,
  isRegent = false,
}: {
  inGameName: string;
  allianceCode?: string | null;
  gameRank?: GameRank | null;
  allianceTitle?: AllianceTitle | null;
  isRegent?: boolean;
}) {
  if (!allianceCode || !gameRank) return inGameName;

  const standing =
    gameRank === "r5"
      ? "Alliance Leader"
      : gameRank === "r4" && allianceTitle
        ? TITLE_LABELS[allianceTitle]
        : RANK_LABELS[gameRank];

  return `[${allianceCode}] ${inGameName} · ${gameRank === "r4" && isRegent ? "Regent · " : ""}${standing}`;
}
