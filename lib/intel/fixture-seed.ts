// SYNTHETIC TEST DATA seeding for development databases and tests only.
// Writes through the real synchronization path (writeResult) so history,
// identity changes, and membership changes behave exactly as live data would.

import { FIXTURE_ALLIANCES, FIXTURE_HOME_ID, fixtureResult, syntheticAlliance } from "./fixture.ts";
import { writeResult, type Sql, type TrackedAlliance } from "./sync.ts";

const HOUR = 3_600_000;

export async function ensureFixtureRows(db: Sql, tenant: string): Promise<Map<string, TrackedAlliance>> {
  await db.query(
    `insert into intel_providers (id, name, base_url, daily_request_limit, reserve_requests)
     values ('fixture', 'Synthetic test data', 'fixture://local', 1000, 100) on conflict (id) do nothing`);
  await db.query(`insert into intel_kingdoms (number, source) values (324, 'manual') on conflict (number) do nothing`);
  const rows = new Map<string, TrackedAlliance>();
  for (const spec of FIXTURE_ALLIANCES) {
    const home = spec.externalId === FIXTURE_HOME_ID;
    const { rows: [row] } = await db.query<TrackedAlliance>(
      `insert into intel_alliances (provider, external_id, kingdom, tag, name, tenant, sync_interval_minutes, member_capacity)
       values ('fixture', $1, 324, $2, $3, $4, $5, $6)
       on conflict (provider, external_id) do update set tracked = true
       returning id, provider, external_id::text, kingdom, tag, name, tenant, sync_interval_minutes, consecutive_failures`,
      [spec.externalId, spec.tag, spec.name, home ? tenant : null, home ? 60 : 360, home ? 50 : null],
    );
    rows.set(spec.externalId, row);
  }
  return rows;
}

/**
 * Replays synthetic history: every 6 hours for `days`, hourly for the last
 * two days for the home alliance, every 12 hours for the others.
 */
export async function seedFixtureHistory(
  db: Sql,
  transaction: <T>(work: (client: Sql) => Promise<T>) => Promise<T>,
  tenant: string,
  options: { days: number; end: Date },
): Promise<number> {
  const alliances = await ensureFixtureRows(db, tenant);
  let written = 0;
  const end = options.end.getTime();
  const start = end - options.days * 24 * HOUR;
  for (const spec of FIXTURE_ALLIANCES) {
    let tracked = alliances.get(spec.externalId)!;
    const home = spec.externalId === FIXTURE_HOME_ID;
    for (let at = start; at <= end; ) {
      const date = new Date(at);
      const result = fixtureResult(syntheticAlliance(spec, date), date);
      const { rows: [run] } = await db.query<{ id: string }>(
        `insert into intel_sync_runs (provider, alliance_id, trigger, started_at) values ('fixture', $1, 'schedule', $2) returning id`,
        [tracked.id, date.toISOString()]);
      await transaction((client) => writeResult(client, tracked, result, run.id));
      tracked = { ...tracked, tag: result.data.tag, name: result.data.name };
      written += 1;
      const step = home ? (end - at <= 48 * HOUR ? HOUR : 6 * HOUR) : 12 * HOUR;
      at += step;
    }
  }
  return written;
}
