// Synchronization engine. Database access and providers are injected so the
// same code runs in route handlers, the scheduler endpoint, and tests.
//
// Guarantees:
//   * an alliance is claimed with a short lease (row lock + next_sync_at push)
//     so overlapping runs never fetch the same alliance twice;
//   * runs abandoned by a crash are closed on the next pass and retried
//     after the lease expires;
//   * provider answers older than a recorded snapshot (cached copies) do not
//     create duplicate history;
//   * member-level rows are written only for tenant alliances, and departed
//     members lose their last-online value immediately;
//   * the shared daily quota keeps a reserve for the tenant's own alliance.

import { ProviderError, redactSecrets, type IntelProvider, type NormalizedAlliance, type ProviderResult } from "./types.ts";

export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R = any>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export interface SyncDeps {
  pool: Sql;
  transaction<T>(work: (client: Sql) => Promise<T>): Promise<T>;
  providers: Record<string, IntelProvider | undefined>;
}

export interface TrackedAlliance {
  id: string;
  provider: string;
  external_id: string;
  kingdom: number;
  tag: string;
  name: string;
  tenant: string | null;
  sync_interval_minutes: number;
  consecutive_failures: number;
}

export type SyncOutcome =
  | { status: "success" | "unchanged"; allianceId: string; runId: string; joined: number; left: number; renamed: boolean }
  | { status: "failed"; allianceId: string; runId: string; code: string }
  | { status: "skipped"; allianceId: string; reason: string };

const LEASE_MINUTES = 15;
const DUPLICATE_WINDOW_SECONDS = 90;
const MAX_BACKOFF_MINUTES = 24 * 60;

/** Next scheduled attempt after a failure: doubles per consecutive failure. */
export function failureDelayMinutes(intervalMinutes: number, failures: number, code: string): number {
  if (code === "rate_limited" || code === "missing_key" || code === "auth") return -1;
  return Math.min(MAX_BACKOFF_MINUTES, Math.max(5, Math.round(intervalMinutes / 4)) * 2 ** Math.min(failures, 8));
}

export function minutesUntilQuotaReset(now: Date): number {
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5);
  return Math.ceil((reset - now.getTime()) / 60000);
}

export interface Budget { remaining: number; limit: number; reserve: number; usedToday: number; known: boolean }

/** Tenant alliances may dip into the reserve; others stop above it. */
export function budgetAllows(budget: Budget, isTenant: boolean, trigger: "schedule" | "manual"): boolean {
  const floor = isTenant || trigger === "manual" ? 5 : budget.reserve;
  return budget.remaining > floor;
}

export async function providerBudget(db: Sql, providerId: string): Promise<Budget> {
  const { rows: [row] } = await db.query<{
    daily_request_limit: number; reserve_requests: number; quota_remaining: number | null;
    quota_limit: number | null; observed_today: boolean; used_today: number;
  }>(
    `select p.daily_request_limit, p.reserve_requests, p.quota_remaining, p.quota_limit,
       coalesce(p.quota_observed_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', false) as observed_today,
       (select coalesce(sum(requests_used), 0)::int from intel_sync_runs r
         where r.provider = p.id and r.started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') as used_today
     from intel_providers p where p.id = $1`,
    [providerId],
  );
  if (!row) return { remaining: 0, limit: 0, reserve: 0, usedToday: 0, known: false };
  const limit = row.quota_limit ?? row.daily_request_limit;
  const remaining = row.observed_today && row.quota_remaining !== null
    ? row.quota_remaining
    : Math.max(0, limit - row.used_today);
  return { remaining, limit, reserve: row.reserve_requests, usedToday: row.used_today, known: row.observed_today };
}

export async function recoverAbandonedRuns(db: Sql): Promise<number> {
  const result = await db.query(
    `update intel_sync_runs set status = 'failed', error_code = 'abandoned',
       error_message = 'The run stopped before finishing and was closed by the next pass.', finished_at = now()
     where status = 'running' and started_at < now() - make_interval(mins => $1)`,
    [LEASE_MINUTES + 5],
  );
  return result.rowCount ?? 0;
}

const ALLIANCE_COLUMNS = `id, provider, external_id::text, kingdom, tag, name, tenant, sync_interval_minutes, consecutive_failures`;

async function claimNextDue(db: Sql): Promise<TrackedAlliance | null> {
  const { rows: [row] } = await db.query<TrackedAlliance>(
    `update intel_alliances a set next_sync_at = now() + make_interval(mins => $1), last_attempt_at = now()
     where a.id = (
       select c.id from intel_alliances c
       join intel_providers p on p.id = c.provider and p.enabled
       where c.tracked and c.next_sync_at <= now()
       order by (c.tenant is not null) desc, c.next_sync_at
       limit 1 for update of c skip locked)
     returning ${ALLIANCE_COLUMNS.split(", ").map((column) => `a.${column}`).join(", ")}`,
    [LEASE_MINUTES],
  );
  return row ?? null;
}

/** Claims one specific alliance for a manual run unless one just started. */
async function claimById(db: Sql, allianceId: string): Promise<TrackedAlliance | null> {
  const { rows: [row] } = await db.query<TrackedAlliance>(
    `update intel_alliances a set next_sync_at = greatest(next_sync_at, now() + make_interval(mins => $2)), last_attempt_at = now()
     where a.id = $1 and (a.last_attempt_at is null or a.last_attempt_at < now() - interval '1 minute')
     returning ${ALLIANCE_COLUMNS.split(", ").map((column) => `a.${column}`).join(", ")}`,
    [allianceId, LEASE_MINUTES],
  );
  return row ?? null;
}

async function startRun(db: Sql, alliance: TrackedAlliance, trigger: "schedule" | "manual", actor: string | null): Promise<string> {
  const { rows: [run] } = await db.query<{ id: string }>(
    `insert into intel_sync_runs (provider, alliance_id, trigger, requested_by) values ($1, $2, $3, $4) returning id`,
    [alliance.provider, alliance.id, trigger, actor],
  );
  return run.id;
}

async function recordFailure(deps: SyncDeps, alliance: TrackedAlliance, runId: string, error: unknown): Promise<string> {
  const failure = error instanceof ProviderError ? error
    : new ProviderError("invalid_response", error instanceof Error ? error.message : "Unknown synchronization error.");
  const failures = alliance.consecutive_failures + 1;
  const delay = failureDelayMinutes(alliance.sync_interval_minutes, failures, failure.code);
  const message = redactSecrets(failure.message);
  await deps.transaction(async (client) => {
    await client.query(
      `update intel_sync_runs set status = 'failed', finished_at = now(), error_code = $2, error_message = $3,
         http_status = $4, attempts = $5, requests_used = $6, quota_remaining = $7 where id = $1`,
      [runId, failure.code, message, failure.status, failure.attempts,
        failure.code === "missing_key" ? 0 : failure.attempts, failure.quota?.remaining ?? null],
    );
    await client.query(
      `update intel_alliances set consecutive_failures = $2, last_error = $3,
         next_sync_at = now() + make_interval(mins => $4) where id = $1`,
      [alliance.id, failures, message, delay >= 0 ? delay : 0],
    );
    if (delay < 0) {
      // Account-level problems pause every alliance on this provider rather than retrying each one.
      const pause = failure.code === "rate_limited" ? minutesUntilQuotaReset(new Date()) : 60;
      await client.query(
        `update intel_alliances set next_sync_at = greatest(next_sync_at, now() + make_interval(mins => $2))
         where provider = $1 and tracked`,
        [alliance.provider, pause],
      );
    }
    await client.query(
      `update intel_providers set
         auth_status = case when $2 = 'missing_key' then 'missing' when $2 = 'auth' then 'rejected' else auth_status end,
         auth_checked_at = case when $2 in ('missing_key', 'auth') then now() else auth_checked_at end,
         quota_remaining = case when $2 = 'rate_limited' then 0 else coalesce($3, quota_remaining) end,
         quota_limit = coalesce($4, quota_limit),
         quota_observed_at = case when $2 = 'rate_limited' or $3::int is not null then now() else quota_observed_at end
       where id = $1`,
      [alliance.provider, failure.code, failure.quota?.remaining ?? null, failure.quota?.limit ?? null],
    );
  });
  return failure.code;
}

export interface AggregateSnapshot {
  memberCount: number;
  membersWithPower: number;
  totalPower: number | null;
  averagePower: number | null;
  sanctuaryLevels: Record<string, number>;
  rosterComplete: boolean;
}

export function aggregateRoster(alliance: NormalizedAlliance): AggregateSnapshot {
  const powered = alliance.members.filter((member) => member.power !== null);
  const totalPower = powered.length ? powered.reduce((sum, member) => sum + (member.power ?? 0), 0) : null;
  const sanctuaryLevels: Record<string, number> = {};
  for (const member of alliance.members) {
    if (member.sanctuaryLevel !== null) sanctuaryLevels[member.sanctuaryLevel] = (sanctuaryLevels[member.sanctuaryLevel] ?? 0) + 1;
  }
  return {
    memberCount: alliance.memberCount,
    membersWithPower: powered.length,
    totalPower,
    averagePower: totalPower !== null ? Math.round(totalPower / powered.length) : null,
    sanctuaryLevels,
    rosterComplete: alliance.rosterIncluded && alliance.members.length >= alliance.memberCount,
  };
}

export async function writeResult(
  client: Sql,
  alliance: TrackedAlliance,
  result: ProviderResult<NormalizedAlliance>,
  runId: string,
): Promise<{ status: "success" | "unchanged"; joined: number; left: number; renamed: boolean }> {
  const data = result.data;
  if (data.externalId !== alliance.external_id) {
    throw new ProviderError("invalid_response", "The provider returned a different alliance than requested.");
  }
  const observed = result.observedAt.toISOString();
  await client.query(
    `update intel_providers set auth_status = 'ok', auth_checked_at = now(),
       quota_remaining = coalesce($2, quota_remaining), quota_limit = coalesce($3, quota_limit),
       quota_resets = coalesce($4, quota_resets),
       quota_observed_at = case when $2::int is not null then now() else quota_observed_at end,
       response_shape = case when $5::jsonb is distinct from response_shape then $5::jsonb else response_shape end,
       response_shape_at = case when $5::jsonb is distinct from response_shape then now() else response_shape_at end
     where id = $1`,
    [alliance.provider, result.quota.remaining, result.quota.limit, result.quota.resets, JSON.stringify(result.shape)],
  );

  const { rows: [duplicate] } = await client.query(
    `select 1 from intel_alliance_snapshots
     where alliance_id = $1 and observed_at between $2::timestamptz - make_interval(secs => $3) and $2::timestamptz + make_interval(secs => $3)
     limit 1`,
    [alliance.id, observed, DUPLICATE_WINDOW_SECONDS],
  );
  const renamed = data.tag !== alliance.tag || data.name !== alliance.name;
  await client.query(
    `update intel_alliances set tag = $2, name = $3, level = coalesce($4, level),
       kingdom = case when $5::int is not null and exists (select 1 from intel_kingdoms where number = $5) then $5 else kingdom end,
       last_success_at = now(), last_observed_at = greatest(last_observed_at, $6::timestamptz),
       consecutive_failures = 0, last_error = null, next_sync_at = now() + make_interval(mins => sync_interval_minutes)
     where id = $1`,
    [alliance.id, data.tag, data.name, data.level, data.kingdom, observed],
  );
  await client.query(
    `insert into intel_alliance_identities (alliance_id, tag, name, first_seen_at, last_seen_at)
     values ($1, $2, $3, $4, $4)
     on conflict (alliance_id, tag, name) do update set
       first_seen_at = least(intel_alliance_identities.first_seen_at, excluded.first_seen_at),
       last_seen_at = greatest(intel_alliance_identities.last_seen_at, excluded.last_seen_at)`,
    [alliance.id, data.tag, data.name, observed],
  );
  if (renamed) {
    await client.query(
      `insert into intel_kingdom_events (kingdom, occurred_at, kind, title, body, alliance_id, source, verification, visibility, dedupe_key)
       values ($1, $2, 'rename', $3, $4, $5, 'derived', 'verified', 'members', $6)
       on conflict (dedupe_key) do nothing`,
      [alliance.kingdom, observed, `[${alliance.tag}] ${alliance.name} is now [${data.tag}] ${data.name}`,
        "Detected by comparing the provider's alliance id across synchronizations.",
        alliance.id, `rename:${alliance.id}:${data.tag}:${data.name}`],
    );
  }

  if (duplicate) {
    await client.query(
      `update intel_sync_runs set status = 'unchanged', finished_at = now(), attempts = $2, requests_used = $2,
         http_status = $3, provider_cached = $4, provider_age_seconds = $5, quota_remaining = $6, members_seen = $7
       where id = $1`,
      [runId, result.attempts, result.httpStatus, result.cached, result.ageSeconds, result.quota.remaining, data.members.length],
    );
    return { status: "unchanged", joined: 0, left: 0, renamed };
  }

  const aggregate = aggregateRoster(data);
  await client.query(
    `insert into intel_alliance_snapshots (alliance_id, observed_at, fetched_at, sync_run_id, tag, name, level,
       member_count, members_with_power, total_power, average_power, sanctuary_levels)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (alliance_id, observed_at) do nothing`,
    [alliance.id, observed, result.fetchedAt.toISOString(), runId, data.tag, data.name, data.level,
      aggregate.memberCount, aggregate.membersWithPower, aggregate.totalPower, aggregate.averagePower,
      JSON.stringify(aggregate.sanctuaryLevels)],
  );

  let joined = 0;
  let left = 0;
  if (alliance.tenant && data.rosterIncluded && data.members.length) {
    const members = data.members;
    const { rows: players } = await client.query<{ id: string; external_uid: string }>(
      `insert into intel_players (provider, external_uid, name, first_seen_at, last_seen_at)
       select $1, t.uid, t.name, $4, $4 from unnest($2::bigint[], $3::text[]) as t(uid, name)
       on conflict (provider, external_uid) do update set
         name = case when excluded.last_seen_at >= intel_players.last_seen_at then excluded.name else intel_players.name end,
         last_seen_at = greatest(intel_players.last_seen_at, excluded.last_seen_at)
       returning id, external_uid::text`,
      [alliance.provider, members.map((member) => member.uid), members.map((member) => member.name), observed],
    );
    const idByUid = new Map(players.map((player) => [player.external_uid, player.id]));
    const ids = members.map((member) => idByUid.get(member.uid)!);
    await client.query(
      `insert into intel_player_names (player_id, name, first_seen_at, last_seen_at)
       select t.id, t.name, $3, $3 from unnest($1::uuid[], $2::text[]) as t(id, name)
       on conflict (player_id, name) do update set
         first_seen_at = least(intel_player_names.first_seen_at, excluded.first_seen_at),
         last_seen_at = greatest(intel_player_names.last_seen_at, excluded.last_seen_at)`,
      [ids, members.map((member) => member.name), observed],
    );
    const { rows: membershipRows } = await client.query<{ inserted: boolean }>(
      `insert into intel_memberships (player_id, alliance_id, provider_joined_at, first_seen_at, last_seen_at, last_online_at)
       select t.id, $2, t.joined, $5, $5, t.online
       from unnest($1::uuid[], $3::timestamptz[], $4::timestamptz[]) as t(id, joined, online)
       on conflict (player_id, alliance_id) where status = 'active' do update set
         provider_joined_at = coalesce(excluded.provider_joined_at, intel_memberships.provider_joined_at),
         last_online_at = case when excluded.last_seen_at >= intel_memberships.last_seen_at
           then coalesce(excluded.last_online_at, intel_memberships.last_online_at) else intel_memberships.last_online_at end,
         last_seen_at = greatest(intel_memberships.last_seen_at, excluded.last_seen_at)
       returning (xmax = 0) as inserted`,
      [ids, alliance.id, members.map((member) => member.joinedAt), members.map((member) => member.lastOnlineAt), observed],
    );
    joined = membershipRows.filter((row) => row.inserted).length;
    await client.query(
      `insert into intel_member_snapshots (player_id, alliance_id, observed_at, power, sanctuary_level, daily_honor, daily_tech, weekly_activity)
       select t.id, $2, $3, t.power, t.sanctuary, t.honor, t.tech, t.activity
       from unnest($1::uuid[], $4::bigint[], $5::int[], $6::bigint[], $7::bigint[], $8::numeric[])
         as t(id, power, sanctuary, honor, tech, activity)
       on conflict do nothing`,
      [ids, alliance.id, observed, members.map((member) => member.power), members.map((member) => member.sanctuaryLevel),
        members.map((member) => member.dailyHonor), members.map((member) => member.dailyTech),
        members.map((member) => member.weeklyActivity)],
    );
    if (aggregate.rosterComplete) {
      // Departures are inferred only from a complete roster; a partial answer never removes anyone.
      const departed = await client.query(
        `update intel_memberships set status = 'left', left_detected_at = $3, last_online_at = null
         where alliance_id = $1 and status = 'active' and not (player_id = any($2::uuid[])) and last_seen_at < $3`,
        [alliance.id, ids, observed],
      );
      left = departed.rowCount ?? 0;
    }
  }

  await client.query(
    `update intel_sync_runs set status = 'success', finished_at = now(), attempts = $2, requests_used = $2,
       http_status = $3, provider_cached = $4, provider_age_seconds = $5, quota_remaining = $6, members_seen = $7
     where id = $1`,
    [runId, result.attempts, result.httpStatus, result.cached, result.ageSeconds, result.quota.remaining, data.members.length],
  );
  return { status: "success", joined, left, renamed };
}

export async function syncAlliance(
  deps: SyncDeps,
  alliance: TrackedAlliance,
  trigger: "schedule" | "manual",
  actor: string | null = null,
): Promise<SyncOutcome> {
  const provider = deps.providers[alliance.provider];
  if (!provider) {
    await deps.pool.query(
      `update intel_alliances set next_sync_at = now() + interval '1 hour' where id = $1`, [alliance.id]);
    return { status: "skipped", allianceId: alliance.id, reason: "provider_unavailable" };
  }
  const runId = await startRun(deps.pool, alliance, trigger, actor);
  let result: ProviderResult<NormalizedAlliance>;
  try {
    // The tenant's own alliance asks for a live game read (same request cost);
    // other alliances reuse the provider's cached copy.
    result = await provider.fetchAlliance(alliance.external_id, { fresh: alliance.tenant !== null });
  } catch (error) {
    const code = await recordFailure(deps, alliance, runId, error);
    return { status: "failed", allianceId: alliance.id, runId, code };
  }
  try {
    const written = await deps.transaction((client) => writeResult(client, alliance, result, runId));
    return { ...written, allianceId: alliance.id, runId };
  } catch (error) {
    const code = await recordFailure(deps, alliance, runId, error);
    return { status: "failed", allianceId: alliance.id, runId, code };
  }
}

export async function runDueSyncs(deps: SyncDeps, options: { limit?: number } = {}): Promise<{
  recovered: number; outcomes: SyncOutcome[]; stoppedFor: string | null; retention: Record<string, unknown>;
}> {
  const recovered = await recoverAbandonedRuns(deps.pool);
  const outcomes: SyncOutcome[] = [];
  let stoppedFor: string | null = null;
  for (let index = 0; index < (options.limit ?? 25); index += 1) {
    const alliance = await claimNextDue(deps.pool);
    if (!alliance) break;
    const budget = await providerBudget(deps.pool, alliance.provider);
    if (!budgetAllows(budget, alliance.tenant !== null, "schedule")) {
      await deps.pool.query(
        `update intel_alliances set next_sync_at = now() + make_interval(mins => $2) where id = $1`,
        [alliance.id, Math.min(minutesUntilQuotaReset(new Date()), 6 * 60)],
      );
      outcomes.push({ status: "skipped", allianceId: alliance.id, reason: "quota_reserve" });
      continue;
    }
    const outcome = await syncAlliance(deps, alliance, "schedule");
    outcomes.push(outcome);
    if (outcome.status === "failed" && ["rate_limited", "missing_key", "auth"].includes(outcome.code)) {
      // recordFailure already pushed every alliance on this provider past the
      // pause, so the loop moves on to other providers without retrying it.
      stoppedFor = outcome.code;
    }
  }
  const retention: Record<string, unknown> = {};
  const { rows: due } = await deps.pool.query<{ tenant: string }>(
    `update intel_settings set retention_ran_at = now()
     where retention_ran_at is null or retention_ran_at < now() - interval '20 hours' returning tenant`,
  );
  for (const { tenant } of due) {
    const { rows: [row] } = await deps.pool.query<{ result: unknown }>(`select intel_apply_retention($1) as result`, [tenant]);
    retention[tenant] = row?.result ?? null;
  }
  return { recovered, outcomes, stoppedFor, retention };
}

/** Manual refresh. Reuses a success from the last five minutes instead of spending quota. */
export async function syncNow(deps: SyncDeps, allianceId: string, actor: string): Promise<SyncOutcome | { status: "recent"; allianceId: string }> {
  const { rows: [recent] } = await deps.pool.query(
    `select 1 from intel_alliances where id = $1 and last_success_at > now() - interval '5 minutes'`, [allianceId]);
  if (recent) return { status: "recent", allianceId };
  const alliance = await claimById(deps.pool, allianceId);
  if (!alliance) return { status: "skipped", allianceId, reason: "already_running" };
  const budget = await providerBudget(deps.pool, alliance.provider);
  if (!budgetAllows(budget, alliance.tenant !== null, "manual")) {
    return { status: "skipped", allianceId, reason: "quota_reserve" };
  }
  return syncAlliance(deps, alliance, "manual", actor);
}

/**
 * Starts tracking another alliance in a kingdom by its tag. Only aggregate
 * statistics are kept for alliances that are not site tenants.
 */
export async function trackAllianceByTag(
  deps: SyncDeps,
  providerId: string,
  kingdom: number,
  tag: string,
  actor: string,
  intervalMinutes = 360,
): Promise<{ allianceId: string; outcome: SyncOutcome } | { error: ProviderError }> {
  const provider = deps.providers[providerId];
  if (!provider) return { error: new ProviderError("missing_key", "This provider is not configured.") };
  const budget = await providerBudget(deps.pool, providerId);
  if (!budgetAllows(budget, false, "manual")) {
    return { error: new ProviderError("rate_limited", "The daily request budget is exhausted.") };
  }
  let result: ProviderResult<NormalizedAlliance>;
  try {
    result = await provider.findAlliance(kingdom, tag);
  } catch (error) {
    return { error: error instanceof ProviderError ? error : new ProviderError("network", "Provider request failed.") };
  }
  const data = result.data;
  const { rows: [row] } = await deps.pool.query<{ id: string }>(
    `insert into intel_alliances (provider, external_id, kingdom, tag, name, sync_interval_minutes, added_by, next_sync_at)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(mins => $6))
     on conflict (provider, external_id) do update set tracked = true
     returning id`,
    [providerId, data.externalId, data.kingdom ?? kingdom, data.tag, data.name, intervalMinutes, actor],
  );
  const { rows: [alliance] } = await deps.pool.query<TrackedAlliance>(
    `select ${ALLIANCE_COLUMNS} from intel_alliances where id = $1`, [row.id]);
  const runId = await startRun(deps.pool, alliance, "manual", actor);
  try {
    const written = await deps.transaction((client) => writeResult(client, alliance, result, runId));
    return { allianceId: row.id, outcome: { ...written, allianceId: row.id, runId } };
  } catch (error) {
    const code = await recordFailure(deps, alliance, runId, error);
    return { allianceId: row.id, outcome: { status: "failed", allianceId: row.id, runId, code } };
  }
}
