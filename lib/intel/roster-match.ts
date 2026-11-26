// Compares what an applicant claims (player ID or name, in-game name, rank)
// with the synced roster. A match shows the claim is consistent with the
// game; it does not prove the applicant controls that character.

import { normalizeRank, type SiteRank } from "./roster-sync.ts";

export interface RosterEntry { player_id: string; uid: string; name: string; rank_label: string | null }

export type MatchStatus = "match" | "mismatch" | "rank_unknown" | "not_found" | "ambiguous";

export interface RosterMatch {
  status: MatchStatus;
  entry: RosterEntry | null;
  rosterRank: SiteRank | null;
  checks: { found: boolean; name: boolean | null; rank: boolean | null };
}

const fold = (value: string) => value.normalize("NFKC").trim().toLowerCase();

export function matchRoster(roster: RosterEntry[], claim: { identifier?: string | null; name?: string | null; rank?: SiteRank | null }): RosterMatch {
  const identifier = claim.identifier?.trim() ?? "";
  let candidates: RosterEntry[] = [];
  if (/^\d{4,19}$/.test(identifier)) candidates = roster.filter((entry) => entry.uid === identifier);
  if (!candidates.length) {
    const wanted = identifier && !/^\d+$/.test(identifier) ? identifier : claim.name ?? "";
    if (wanted.trim()) candidates = roster.filter((entry) => fold(entry.name) === fold(wanted));
  }
  if (candidates.length > 1) return { status: "ambiguous", entry: null, rosterRank: null, checks: { found: false, name: null, rank: null } };
  const entry = candidates[0] ?? null;
  if (!entry) return { status: "not_found", entry: null, rosterRank: null, checks: { found: false, name: null, rank: null } };
  const rosterRank = normalizeRank(entry.rank_label);
  const name = claim.name?.trim() ? fold(claim.name) === fold(entry.name) : null;
  const rank = claim.rank && rosterRank ? claim.rank === rosterRank : null;
  const status: MatchStatus = name === false || rank === false ? "mismatch" : rank === null && claim.rank ? "rank_unknown" : "match";
  return { status, entry, rosterRank, checks: { found: true, name, rank } };
}
