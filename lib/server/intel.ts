import { NextResponse } from "next/server";
import { LastAsylumTracker } from "@/lib/intel/lat.ts";
import { FixtureProvider } from "@/lib/intel/fixture.ts";
import type { IntelProvider } from "@/lib/intel/types.ts";
import type { SyncDeps } from "@/lib/intel/sync.ts";
import { getSessionUser, type SessionUser } from "./auth";
import { pool, query, queryOne, withTransaction } from "./db";
import { jsonError } from "./http";

/**
 * Synthetic fixtures are available only outside production and only when
 * explicitly enabled, so test data can never reach the live site.
 */
export function fixturesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.INTEL_FIXTURES === "1";
}

export function activeProviderId(): string {
  return fixturesEnabled() ? "fixture" : "lat";
}

let registry: Record<string, IntelProvider | undefined> | null = null;
export function providers(): Record<string, IntelProvider | undefined> {
  registry ??= {
    lat: new LastAsylumTracker({ apiKey: process.env.LAT_API_KEY }),
    fixture: fixturesEnabled() ? new FixtureProvider() : undefined,
  };
  return registry;
}

export function apiKeyConfigured(): boolean {
  return Boolean(process.env.LAT_API_KEY?.trim());
}

export function syncDeps(): SyncDeps {
  return {
    pool: { query: (text, params) => pool.query(text, params) as never },
    transaction: (work) => withTransaction((client) => work({ query: (text, params) => client.query(text, params) as never })),
    providers: providers(),
  };
}

export interface IntelAccess {
  tenant: string | null;
  allianceName: string | null;
  kingdom: number | null;
  member: boolean;
  leadership: boolean;
  platformAdmin: boolean;
  gameRank: string | null;
  inGameName: string | null;
  linkedPlayerId: string | null;
}

/** Tenant comes only from the viewer's own verified membership. */
export async function getIntelAccess(userId: string): Promise<IntelAccess> {
  const row = await queryOne<{
    tenant: string | null; alliance_name: string | null; kingdom: number | null; game_rank: string | null;
    in_game_name: string | null; platform_admin: boolean; linked_player_id: string | null;
  }>(
    `select am.alliance as tenant, a.name as alliance_name, a.kingdom_number as kingdom, am.game_rank::text,
       p.in_game_name, is_platform_admin($1) as platform_admin,
       (select player_id from intel_player_links l where l.user_id = $1 and l.tenant = am.alliance) as linked_player_id
     from users u
     left join profiles p on p.id = u.id
     left join alliance_members am on am.user_id = u.id and am.verified_at is not null
     left join alliances a on a.slug = am.alliance
     where u.id = $1`,
    [userId],
  );
  const tenant = row?.tenant ?? null;
  return {
    tenant,
    allianceName: row?.alliance_name ?? null,
    kingdom: row?.kingdom ?? null,
    member: tenant !== null,
    leadership: tenant !== null && (row?.game_rank === "r4" || row?.game_rank === "r5"),
    platformAdmin: row?.platform_admin ?? false,
    gameRank: row?.game_rank ?? null,
    inGameName: row?.in_game_name ?? null,
    linkedPlayerId: row?.linked_player_id ?? null,
  };
}

type Gate = "member" | "leadership" | "platform";

export async function requireIntel(gate: Gate): Promise<
  | { user: SessionUser; access: IntelAccess; tenant: string; response?: undefined }
  | { user: SessionUser; access: IntelAccess; tenant: null; response?: undefined }
  | { user?: undefined; access?: undefined; tenant?: undefined; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) return { response: jsonError("Sign in to continue.", 401) };
  const access = await getIntelAccess(user.id);
  if (gate === "platform") {
    if (!access.platformAdmin) return { response: jsonError("Only platform administrators can manage the integration.", 403) };
    return { user, access, tenant: access.tenant } as never;
  }
  if (!access.member || !access.tenant) return { response: jsonError("Alliance intelligence is available to verified alliance members.", 403) };
  if (gate === "leadership" && !access.leadership) return { response: jsonError("Only R4 and R5 leadership can open this area.", 403) };
  return { user, access, tenant: access.tenant };
}

export async function audit(tenant: string | null, actor: string | null, action: string, target: string | null, detail: Record<string, unknown> = {}) {
  await query(
    `insert into intel_audit_log (tenant, actor, action, target, detail) values ($1, $2, $3, $4, $5)`,
    [tenant, actor, action.slice(0, 60), target?.slice(0, 120) ?? null, JSON.stringify(detail)],
  );
}

export interface HomeAlliance {
  id: string;
  provider: string;
  external_id: string;
  kingdom: number;
  tag: string;
  name: string;
  level: number | null;
  member_capacity: number | null;
  sync_interval_minutes: number;
  last_success_at: string | null;
  last_observed_at: string | null;
  last_attempt_at: string | null;
  next_sync_at: string;
  consecutive_failures: number;
  last_error: string | null;
}

export async function homeAlliance(tenant: string): Promise<HomeAlliance | null> {
  return queryOne<HomeAlliance>(
    `select id, provider, external_id::text, kingdom, tag, name, level, member_capacity, sync_interval_minutes,
       last_success_at, last_observed_at, last_attempt_at, next_sync_at, consecutive_failures, last_error
     from intel_alliances where tenant = $1 and provider = $2`,
    [tenant, activeProviderId()],
  );
}

/** Freshness block every intel response carries. */
export function freshness(alliance: Pick<HomeAlliance, "last_success_at" | "last_observed_at" | "consecutive_failures" | "last_error"> | null) {
  const observed = alliance?.last_observed_at ? new Date(alliance.last_observed_at).getTime() : null;
  const age = observed === null ? null : Date.now() - observed;
  return {
    synthetic: activeProviderId() === "fixture",
    last_success_at: alliance?.last_success_at ?? null,
    last_observed_at: alliance?.last_observed_at ?? null,
    stale: age === null || age > 6 * 3_600_000,
    failing: (alliance?.consecutive_failures ?? 0) > 0,
  };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
