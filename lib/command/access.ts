export type AllianceRank = "r1" | "r2" | "r3" | "r4" | "r5";
export type OfficerRank = Extract<AllianceRank, "r3" | "r4" | "r5">;

const rankValue: Record<AllianceRank, number> = {
  r1: 1,
  r2: 2,
  r3: 3,
  r4: 4,
  r5: 5,
};

export function hasOfficerAccess(
  rank: AllianceRank | null,
  minimum: OfficerRank,
  isRegent = false,
): boolean {
  return rank !== null && (rankValue[rank] >= rankValue[minimum] || (rank === "r4" && isRegent));
}
