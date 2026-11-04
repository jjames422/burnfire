import type { AllianceRank } from "./access";

const ranks: AllianceRank[] = ["r1", "r2", "r3", "r4", "r5"];

export function isAllianceRank(value: unknown): value is AllianceRank {
  return typeof value === "string" && ranks.some((rank) => rank === value);
}

export function permissionForRank(rank: AllianceRank): "member" | "officer" | "admin" {
  return rank === "r5" ? "admin" : rank === "r4" || rank === "r3" ? "officer" : "member";
}

export function canAssignRank(
  actorRank: AllianceRank | null,
  siteAdmin: boolean,
  currentRank: AllianceRank | null,
  nextRank: AllianceRank,
  isRegent = false,
): boolean {
  if (siteAdmin) return true;
  if (actorRank !== "r4" && actorRank !== "r5") return false;
  const ceiling = ranks.indexOf(actorRank === "r4" && isRegent ? "r5" : actorRank);
  return ranks.indexOf(nextRank) < ceiling &&
    (currentRank === null || ranks.indexOf(currentRank) < ceiling);
}

export function canAppointRegent(actorRank: AllianceRank | null, siteAdmin: boolean): boolean {
  return siteAdmin || actorRank === "r5";
}
