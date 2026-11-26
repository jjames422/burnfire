import type { RosterEntry } from "@/lib/intel/roster-match.ts";
import { activeProviderId } from "./intel";
import { query, queryOne } from "./db";

/** A roster older than this is not used to block or admit anyone. */
export const ROSTER_MAX_AGE_HOURS = 6;

/** Current members of the tenant's home alliance from the last successful sync. */
export async function homeRoster(tenant: string): Promise<{ asOf: string | null; usable: boolean; members: RosterEntry[] }> {
  const alliance = await queryOne<{ id: string; last_observed_at: string | null }>(
    `select id, last_observed_at from intel_alliances where tenant = $1 and provider = $2`, [tenant, activeProviderId()]);
  if (!alliance?.last_observed_at) return { asOf: null, usable: false, members: [] };
  const members = await query<RosterEntry>(
    `select p.id as player_id, p.external_uid::text as uid, p.name, m.rank_label
     from intel_memberships m join intel_players p on p.id = m.player_id
     where m.alliance_id = $1 and m.status = 'active' order by p.name`,
    [alliance.id],
  );
  const age = Date.now() - new Date(alliance.last_observed_at).getTime();
  return { asOf: alliance.last_observed_at, usable: members.length > 0 && age < ROSTER_MAX_AGE_HOURS * 3_600_000, members };
}
