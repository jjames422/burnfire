// Keeps verified site members' alliance rank and in-game name in step with
// the synced game roster. Applies only to accounts linked to a character
// (leadership-confirmed or approved with a roster match). Every change is
// written to membership_history with source 'roster'.

import type { Sql } from "./sync.ts";

export type SiteRank = "r1" | "r2" | "r3" | "r4" | "r5";
const R4_TITLES = new Set(["diplomat", "recruiter", "goddess", "god_of_war"]);

/**
 * Game rank labels look like "R2" or "R4 · Militarist" (rank plus in-game title).
 * Returns the site rank, or null when the label has no recognizable rank.
 */
export function normalizeRank(label: string | null | undefined): SiteRank | null {
  if (!label) return null;
  const clean = label.trim().toLowerCase();
  if (clean === "leader" || clean.startsWith("leader ")) return "r5";
  const match = /^r?([1-5])(?![0-9])/.exec(clean);
  return match ? (`r${match[1]}` as SiteRank) : null;
}

/** The in-game title after the rank ("R4 · Militarist" → "Militarist"), if any. */
export function rosterTitle(label: string | null | undefined): string | null {
  const part = label?.split(/[·•|]/).slice(1).join(" ").trim();
  return part ? part.slice(0, 40) : null;
}

/** Titles and Regent that remain valid after a rank change (mirrors the schema checks). */
export function titlesAfter(target: SiteRank, current: { rank: SiteRank; title: string | null; regent: boolean }) {
  if (target === "r5") return { title: "alliance_leader", regent: false };
  if (target === "r4" && current.rank === "r4") {
    return { title: current.title && R4_TITLES.has(current.title) ? current.title : null, regent: current.regent };
  }
  return { title: null, regent: false };
}

export interface RosterChange { userId: string; name: string; from: SiteRank; to: SiteRank }

export async function applyRosterToSite(client: Sql, tenant: string, allianceId: string): Promise<{
  rankChanges: RosterChange[]; renamed: { userId: string; from: string; to: string }[]; skipped: { userId: string; reason: string }[];
}> {
  const { rows } = await client.query<{
    user_id: string; game_rank: SiteRank; alliance_title: string | null; is_regent: boolean;
    in_game_name: string; rank_label: string | null; roster_name: string;
  }>(
    `select l.user_id, am.game_rank::text as game_rank, am.alliance_title::text as alliance_title, am.is_regent,
       p.in_game_name, m.rank_label, pl.name as roster_name
     from intel_player_links l
     join alliance_members am on am.user_id = l.user_id and am.alliance = l.tenant and am.verified_at is not null
     join profiles p on p.id = l.user_id
     join intel_memberships m on m.player_id = l.player_id and m.alliance_id = $2 and m.status = 'active'
     join intel_players pl on pl.id = l.player_id
     where l.tenant = $1`,
    [tenant, allianceId],
  );
  const rankChanges: RosterChange[] = [];
  const renamed: { userId: string; from: string; to: string }[] = [];
  const skipped: { userId: string; reason: string }[] = [];
  const order = (rank: SiteRank) => Number(rank.slice(1));
  const pending = rows
    .map((row) => ({ row, target: normalizeRank(row.rank_label) }))
    .filter((item): item is { row: (typeof rows)[number]; target: SiteRank } => item.target !== null && item.target !== item.row.game_rank)
    // Demotions first, so a departing leader frees the single R5 slot before a promotion needs it.
    .sort((a, b) => (order(a.target) - order(a.row.game_rank)) - (order(b.target) - order(b.row.game_rank)));

  for (const { row, target } of pending) {
    // Leadership transfers grant or remove full alliance administration, so a change into or
    // out of R5 is reported for an officer to confirm instead of being applied automatically.
    if (target === "r5" || row.game_rank === "r5") {
      skipped.push({ userId: row.user_id, reason: "leader_change_needs_officer" });
      continue;
    }
    const next = titlesAfter(target, { rank: row.game_rank, title: row.alliance_title, regent: row.is_regent });
    await client.query(
      `update alliance_members set game_rank = $2::game_rank, alliance_title = $3::alliance_title, is_regent = $4
       where user_id = $1 and alliance = $5`,
      [row.user_id, target, next.title, next.regent, tenant],
    );
    await client.query(
      `insert into membership_history (user_id, changed_by, previous_rank, new_rank, previous_title, new_title, previous_regent, new_regent, source)
       values ($1, null, $2::game_rank, $3::game_rank, $4::alliance_title, $5::alliance_title, $6, $7, 'roster')`,
      [row.user_id, row.game_rank, target, row.alliance_title, next.title, row.is_regent, next.regent],
    );
    rankChanges.push({ userId: row.user_id, name: row.roster_name, from: row.game_rank, to: target });
  }

  for (const row of rows) {
    const name = row.roster_name.trim();
    if (name && name.length <= 40 && name !== row.in_game_name) {
      await client.query(`update profiles set in_game_name = $2 where id = $1`, [row.user_id, name]);
      renamed.push({ userId: row.user_id, from: row.in_game_name, to: name });
    }
  }

  if (rankChanges.length || renamed.length || skipped.length) {
    await client.query(
      `insert into intel_audit_log (tenant, actor, action, target, detail) values ($1, null, 'roster.site_sync', $2, $3)`,
      [tenant, `alliance:${allianceId}`, JSON.stringify({ rankChanges, renamed, skipped })],
    );
  }
  return { rankChanges, renamed, skipped };
}
