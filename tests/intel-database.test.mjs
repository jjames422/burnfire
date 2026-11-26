import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";
import { storedEmail } from "./email-fixtures.mjs";
import { FixtureProvider, FIXTURE_ALLIANCES, FIXTURE_HOME_ID, fixtureResult, syntheticAlliance } from "../lib/intel/fixture.ts";
import { ensureFixtureRows } from "../lib/intel/fixture-seed.ts";
import { runDueSyncs, syncNow, trackAllianceByTag, writeResult, recoverAbandonedRuns } from "../lib/intel/sync.ts";
import { ProviderError } from "../lib/intel/types.ts";

// Runs against a local database inside one transaction in a throwaway schema,
// then rolls everything back. Uses SYNTHETIC TEST DATA only.
const connectionString = process.env.BURNFIRE_TEST_DATABASE_URL;

function guard(url) {
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Tests require a local database");
  assert.notEqual(url.port || "5432", "5432", "Never connect to the shared port-5432 instance");
}

async function isolated(run) {
  const url = new URL(connectionString);
  guard(url);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schemaName = `intel_test_${randomBytes(8).toString("hex")}`;
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", pg_catalog`);
    const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
    await client.query(schema);
    await client.query(schema);
    let depth = 0;
    const transaction = async (work) => {
      const name = `sp_${depth += 1}`;
      await client.query(`SAVEPOINT ${name}`);
      try {
        const result = await work(client);
        await client.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
        throw error;
      }
    };
    await run(client, transaction);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

const home = FIXTURE_ALLIANCES.find((spec) => spec.externalId === FIXTURE_HOME_ID);
const at = (iso) => new Date(iso);

test("synchronization keeps identities, history, and membership consistent", { skip: !connectionString }, async () => {
  await isolated(async (db, transaction) => {
    const alliances = await ensureFixtureRows(db, "burnfire");
    let tracked = alliances.get(FIXTURE_HOME_ID);
    const write = async (iso, mutate = (data) => data) => {
      const date = at(iso);
      const result = fixtureResult(mutate(syntheticAlliance(home, date)), date);
      const { rows: [run] } = await db.query("insert into intel_sync_runs (provider, alliance_id, trigger) values ('fixture', $1, 'schedule') returning id", [tracked.id]);
      const outcome = await transaction((client) => writeResult(client, tracked, result, run.id));
      tracked = { ...tracked, tag: result.data.tag, name: result.data.name };
      return outcome;
    };
    const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].count);

    const first = await write("2026-11-01T00:00:00Z");
    assert.equal(first.status, "success");
    assert.equal(first.joined, home.members, "every roster member becomes one active membership");
    assert.equal(await count("select count(*) from intel_players"), home.members);

    const again = await write("2026-11-01T00:00:30Z");
    assert.equal(again.status, "unchanged", "a cached copy within the duplicate window is not stored twice");
    assert.equal(await count("select count(*) from intel_alliance_snapshots"), 1);

    await write("2026-11-09T00:00:00Z");
    const renamed = (await db.query("select p.id, p.name, (select count(*) from intel_player_names n where n.player_id = p.id)::int as names from intel_players p where external_uid = $1", [`${FIXTURE_HOME_ID}003`])).rows[0];
    assert.equal(renamed.name, "Test Member 04 Renamed");
    assert.equal(renamed.names, 2, "the old name is kept as history");
    assert.equal(await count("select count(*) from intel_players"), home.members, "a rename never creates a second player");

    const left = await write("2026-11-13T00:00:00Z");
    assert.equal(left.left, 1);
    const departed = (await db.query("select status, last_online_at from intel_memberships m join intel_players p on p.id = m.player_id where p.external_uid = $1", [`${FIXTURE_HOME_ID}012`])).rows[0];
    assert.equal(departed.status, "left");
    assert.equal(departed.last_online_at, null, "departed members keep no last-online value");

    const joined = await write("2026-11-15T00:00:00Z");
    assert.equal(joined.joined, 1);

    const partial = await write("2026-11-16T00:00:00Z", (data) => ({ ...data, members: data.members.slice(0, 10) }));
    assert.equal(partial.left, 0, "a partial roster never marks anyone as departed");
    assert.equal(await count("select count(*) from intel_memberships where status = 'active'"), home.members);

    const late = await write("2026-11-05T00:00:00Z");
    assert.equal(late.status, "success");
    const current = (await db.query("select name from intel_players where external_uid = $1", [`${FIXTURE_HOME_ID}003`])).rows[0];
    assert.equal(current.name, "Test Member 04 Renamed", "an out-of-order older copy does not revert the current name");

    const snapshots = (await db.query("select count(*)::int as count, count(distinct observed_at)::int as distinct from intel_member_snapshots")).rows[0];
    assert.equal(snapshots.count, snapshots.distinct * 1 + (snapshots.count - snapshots.distinct), "no duplicate member snapshot keys");
    const { rows: [{ dupes }] } = await db.query("select count(*)::int as dupes from (select player_id, observed_at from intel_member_snapshots group by 1, 2 having count(*) > 1) d");
    assert.equal(dupes, 0);
  });
});

test("other alliances keep aggregates only, and tag changes become kingdom records", { skip: !connectionString }, async () => {
  await isolated(async (db, transaction) => {
    await db.query("insert into intel_providers (id, name, base_url) values ('fixture', 'Synthetic', 'fixture://') on conflict do nothing");
    let clock = at("2026-11-01T00:00:00Z");
    const providers = { fixture: new FixtureProvider(() => clock) };
    const deps = { pool: db, transaction, providers };
    const { rows: [user] } = await db.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail("intel-track@example.invalid"));
    const tracked = await trackAllianceByTag(deps, "fixture", 324, "TA3", user.id);
    assert.equal(tracked.outcome.status, "success");
    assert.equal(Number((await db.query("select count(*) from intel_players")).rows[0].count), 0, "no member rows for a non-tenant alliance");
    assert.equal(Number((await db.query("select count(*) from intel_alliance_snapshots")).rows[0].count), 1);

    clock = at("2026-11-12T00:00:00Z");
    await db.query("update intel_alliances set last_success_at = now() - interval '1 day', last_attempt_at = null");
    const refreshed = await syncNow(deps, tracked.allianceId, user.id);
    assert.equal(refreshed.status, "success");
    assert.equal(refreshed.renamed, true);
    const { rows: [alliance] } = await db.query("select tag, name from intel_alliances where id = $1", [tracked.allianceId]);
    assert.equal(alliance.tag, "TA3X");
    const { rows: events } = await db.query("select kind, source, verification from intel_kingdom_events");
    assert.deepEqual(events, [{ kind: "rename", source: "derived", verification: "verified" }]);
    assert.equal(Number((await db.query("select count(*) from intel_alliance_identities")).rows[0].count), 2);

    const repeat = await syncNow(deps, tracked.allianceId, user.id);
    assert.equal(repeat.status, "recent", "a manual refresh right after a success reuses it");
    const duplicate = await trackAllianceByTag(deps, "fixture", 324, "TA3X", user.id);
    assert.equal(duplicate.allianceId, tracked.allianceId, "tracking the same alliance twice does not duplicate it");
  });
});

test("failures back off, account errors pause the provider, and abandoned runs recover", { skip: !connectionString }, async () => {
  await isolated(async (db, transaction) => {
    await ensureFixtureRows(db, "burnfire");
    await db.query("update intel_alliances set tracked = false where provider = 'lat'");
    let failure = new ProviderError("unavailable", "busy", { status: 503, retryable: true, attempts: 3 });
    const provider = { id: "fixture", synthetic: true, fetchAlliance: async () => { throw failure; }, findAlliance: async () => { throw failure; } };
    const deps = { pool: db, transaction, providers: { fixture: provider } };

    const busy = await runDueSyncs(deps, { limit: 1 });
    assert.equal(busy.outcomes[0].status, "failed");
    const { rows: [afterBusy] } = await db.query("select consecutive_failures, next_sync_at > now() + interval '10 minutes' as later from intel_alliances where tenant = 'burnfire' and provider = 'fixture'");
    assert.deepEqual(afterBusy, { consecutive_failures: 1, later: true });
    const { rows: [run] } = await db.query("select status, error_code, requests_used, http_status from intel_sync_runs order by started_at desc limit 1");
    assert.deepEqual(run, { status: "failed", error_code: "unavailable", requests_used: 3, http_status: 503 });

    await db.query("update intel_alliances set next_sync_at = now() - interval '1 minute' where provider = 'fixture'");
    failure = new ProviderError("rate_limited", "limit", { status: 429, quota: { limit: 1000, remaining: 0, resets: "00:00 UTC" } });
    const limited = await runDueSyncs(deps, { limit: 10 });
    assert.equal(limited.stoppedFor, "rate_limited");
    assert.equal(limited.outcomes.length, 1, "one rate limit pauses the provider; no second request is attempted");
    const { rows: [{ waiting }] } = await db.query("select count(*)::int as waiting from intel_alliances where provider = 'fixture' and next_sync_at <= now() + interval '30 minutes'");
    assert.equal(waiting, 0, "every alliance on the provider waits for the quota reset");
    const { rows: [quota] } = await db.query("select quota_remaining from intel_providers where id = 'fixture'");
    assert.equal(quota.quota_remaining, 0);

    failure = new ProviderError("auth", "rejected", { status: 401 });
    await db.query("update intel_alliances set next_sync_at = now() - interval '1 minute' where provider = 'fixture'");
    await db.query("update intel_providers set quota_remaining = 900 where id = 'fixture'");
    await runDueSyncs(deps, { limit: 3 });
    const { rows: [auth] } = await db.query("select auth_status from intel_providers where id = 'fixture'");
    assert.equal(auth.auth_status, "rejected");
    const { rows: messages } = await db.query("select error_message from intel_sync_runs where error_message ilike '%lap_%' and error_message not ilike '%redacted%'");
    assert.equal(messages.length, 0, "no stored error text contains a key");

    await db.query("insert into intel_sync_runs (provider, trigger, started_at) values ('fixture', 'schedule', now() - interval '2 hours')");
    assert.equal(await recoverAbandonedRuns(db), 1);
  });
});

test("leadership access is tenant-scoped and platform administration does not cross alliances", { skip: !connectionString }, async () => {
  await isolated(async (db) => {
    await db.query("insert into alliances (slug, name, code, kingdom_number) values ('testally', 'Test Ally', 'TAL', 324)");
    const make = async (label, alliance, rank) => {
      const { rows: [user] } = await db.query("insert into users (email_hash, email_encrypted) values ($1, $2) returning id", storedEmail(`${label}@example.invalid`));
      await db.query("insert into profiles (id, in_game_name) values ($1, $2)", [user.id, label]);
      if (alliance) await db.query("insert into alliance_members (user_id, alliance, game_rank, verified_at, alliance_title) values ($1, $2, $3, now(), $4)", [user.id, alliance, rank, rank === "r5" ? "alliance_leader" : null]);
      return user.id;
    };
    const r4 = await make("intel-r4", "burnfire", "r4");
    const r3 = await make("intel-r3", "burnfire", "r3");
    const otherLeader = await make("intel-other-r5", "testally", "r5");
    const admin = await make("intel-admin", null, null);
    await db.query("insert into platform_admins (user_id) values ($1)", [admin]);
    const check = async (fn, actor, tenant) => (await db.query(`select ${fn}($1, $2) as allowed`, [actor, tenant])).rows[0].allowed;
    assert.equal(await check("intel_is_leadership", r4, "burnfire"), true);
    assert.equal(await check("intel_is_leadership", r3, "burnfire"), false);
    assert.equal(await check("intel_is_member", r3, "burnfire"), true);
    assert.equal(await check("intel_is_leadership", otherLeader, "burnfire"), false, "another alliance's leader sees nothing of BF2");
    assert.equal(await check("intel_is_member", otherLeader, "burnfire"), false);
    assert.equal(await check("intel_is_leadership", admin, "burnfire"), false, "platform admin alone grants no leadership records");
    await db.query("update alliance_members set verified_at = null where user_id = $1", [r4]);
    assert.equal(await check("intel_is_leadership", r4, "burnfire"), false, "unverified rank grants nothing");
  });
});

test("retention thins old member history to one row per day and removes departed members' history", { skip: !connectionString }, async () => {
  await isolated(async (db) => {
    const alliances = await ensureFixtureRows(db, "burnfire");
    const homeRow = alliances.get(FIXTURE_HOME_ID);
    const { rows: [player] } = await db.query("insert into intel_players (provider, external_uid, name) values ('fixture', 77, 'Test Retention') returning id");
    const { rows: [gone] } = await db.query("insert into intel_players (provider, external_uid, name) values ('fixture', 78, 'Test Departed') returning id");
    await db.query("insert into intel_memberships (player_id, alliance_id, first_seen_at, last_seen_at) values ($1, $2, now(), now())", [player.id, homeRow.id]);
    await db.query("insert into intel_memberships (player_id, alliance_id, first_seen_at, last_seen_at, status, left_detected_at) values ($1, $2, now() - interval '200 days', now() - interval '120 days', 'left', now() - interval '120 days')", [gone.id, homeRow.id]);
    for (const hours of [24 * 20 + 1, 24 * 20 + 2, 24 * 20 + 3, 24 * 400, 1]) {
      await db.query("insert into intel_member_snapshots (player_id, alliance_id, observed_at, power) values ($1, $2, date_trunc('day', now()) - make_interval(hours => $3), 1)", [player.id, homeRow.id, hours]);
    }
    await db.query("insert into intel_member_snapshots (player_id, alliance_id, observed_at, power) values ($1, $2, now() - interval '121 days', 1)", [gone.id, homeRow.id]);
    const { rows: [{ result }] } = await db.query("select intel_apply_retention('burnfire') as result");
    assert.deepEqual(result, { member_thinned: 2, member_expired: 1, departed_removed: 1, aggregate_thinned: 0 });
    const { rows: [{ count }] } = await db.query("select count(*)::int as count from intel_member_snapshots");
    assert.equal(count, 2);
  });
});

test("an account failure on one provider does not stop other providers", { skip: !connectionString }, async () => {
  await isolated(async (db, transaction) => {
    await ensureFixtureRows(db, "burnfire");
    await db.query("update intel_alliances set next_sync_at = now() - interval '1 minute'");
    let clock = at("2026-11-20T00:00:00Z");
    const broken = { id: "lat", synthetic: false, fetchAlliance: async () => { throw new ProviderError("missing_key", "no key", { attempts: 0 }); }, findAlliance: async () => { throw new Error("unused"); } };
    const deps = { pool: db, transaction, providers: { lat: broken, fixture: new FixtureProvider(() => clock) } };
    const result = await runDueSyncs(deps, { limit: 20 });
    assert.equal(result.stoppedFor, "missing_key");
    const statuses = result.outcomes.map((outcome) => outcome.status);
    assert.equal(statuses.filter((status) => status === "failed").length, 1, "the keyless provider is tried once");
    assert.equal(statuses.filter((status) => status === "success").length, FIXTURE_ALLIANCES.length, "every fixture alliance still syncs");
    const { rows: [run] } = await db.query("select requests_used from intel_sync_runs where error_code = 'missing_key'");
    assert.equal(run.requests_used, 0, "a missing key spends no quota");
  });
});
