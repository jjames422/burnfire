// Seeds SYNTHETIC TEST DATA into a development database for the kingdom
// intelligence screens. Refuses to touch anything that could be production:
// the database name must end in "_dev" and the port cannot be 5432 or 5433.
//
//   DATABASE_URL=postgresql://dev@127.0.0.1:55471/burnfire_dev \
//     node --experimental-strip-types scripts/intel-seed-fixtures.mjs
import pg from "pg";
import { seedFixtureHistory } from "../lib/intel/fixture-seed.ts";
import { FIXTURE_HOME_ID } from "../lib/intel/fixture.ts";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!url.pathname.endsWith("_dev") || ["5432", "5433", ""].includes(url.port) || process.env.NODE_ENV === "production") {
  console.error("Refusing: fixtures may only be seeded into a *_dev database on a non-production port.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url.toString() });
const db = { query: (text, params) => pool.query(text, params) };
const transaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work({ query: (text, params) => client.query(text, params) });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const end = new Date(Date.now() - 20 * 60_000);
const written = await seedFixtureHistory(db, transaction, "burnfire", { days: 100, end });
await db.query(`update intel_alliances set next_sync_at = now() + interval '40 minutes' where provider = 'fixture'`);

// Sample leadership records so every screen has content. All text says "Test".
const { rows: [home] } = await db.query(`select id from intel_alliances where provider = 'fixture' and external_id = $1`, [FIXTURE_HOME_ID]);
const { rows: others } = await db.query(`select id, tag from intel_alliances where provider = 'fixture' and tenant is null order by tag`);
const player = async (suffix) => (await db.query(`select id from intel_players where provider = 'fixture' and external_uid = $1`, [`${FIXTURE_HOME_ID}${suffix}`])).rows[0].id;
await db.query(`insert into intel_absences (tenant, player_id, starts_on, ends_on, reason)
  values ('burnfire', $1, current_date - 3, current_date + 4, 'Test absence: travelling') on conflict do nothing`, [await player("019")]);
const { rows: [review] } = await db.query(`insert into intel_reviews (tenant, player_id, opened_reason, evidence)
  values ('burnfire', $1, 'Test review: no power growth for 10 days', '{"source":"test"}') on conflict do nothing returning id`, [await player("007")]);
if (review) await db.query(`insert into intel_review_events (review_id, kind, body, to_status) values ($1, 'opened', 'Test review opened', 'needs_review')`, [review.id]);
const stances = ["allied", "nap", "rival", "watch"];
for (const [index, alliance] of others.entries()) {
  await db.query(`insert into intel_relations (tenant, alliance_id, stance, summary) values ('burnfire', $1, $2, $3) on conflict do nothing`,
    [alliance.id, stances[index % stances.length], `Test relationship summary for ${alliance.tag}`]);
}
await db.query(`insert into intel_treaties (tenant, alliance_id, kind, status, title, terms, starts_on)
  values ('burnfire', $1, 'nap', 'active', 'Test non-aggression pact', 'Test terms: no attacks on members or farms.', current_date - 20)`, [others[1].id]);
await db.query(`insert into intel_leadership_notes (tenant, category, title, body)
  values ('burnfire', 'recruitment', 'Test recruitment target', 'Test note: recruit two sanctuary 20+ members before the next event.')`);
await db.query(`insert into intel_kingdom_events (kingdom, occurred_at, kind, title, body, source, verification, visibility, tenant)
  values (324, now() - interval '12 days', 'throne', 'Test throne change', 'Test record entered by leadership.', 'manual', 'reported', 'members', 'burnfire'),
         (324, now() - interval '40 days', 'kvk', 'Test KvK result', 'Test record entered by leadership.', 'manual', 'verified', 'public', 'burnfire')`);
await db.query(`update intel_kingdoms set name = 'Test Kingdom Name', opened_on = current_date - 410, season = 'Test Season 3' where number = 324`);
console.log(`Seeded ${written} synthetic synchronizations.`);
await pool.end();
