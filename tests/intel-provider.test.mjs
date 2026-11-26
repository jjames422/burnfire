import assert from "node:assert/strict";
import test from "node:test";
import { LastAsylumTracker, normalizeAlliance, responseShape, timestamp, backoffMs } from "../lib/intel/lat.ts";
import { ProviderError, redactSecrets } from "../lib/intel/types.ts";

// TEST DATA: synthetic response bodies shaped after the field names in the
// public documentation. They are not captured provider responses.
const body = (overrides = {}) => ({
  ok: true, cached: true, age_seconds: 120, refreshing: false,
  quota: { limit: 1000, used: 3, remaining: 997, resets: "00:00 UTC" },
  alliance: {
    aid: 900000001, kid: 324, abbr: "TST", name: "Test Alliance", level: 7, member_count: 2,
    declaration: "Synthetic test declaration",
    members: [
      { uid: 145563254785, name: "Test One", power: 1234567, sanctuary_lv: 22, x: 101, y: 202, online: true,
        last_online_at: 1795000000, joined_at: "2026-08-01T00:00:00Z", active: 1500, daily_honor: 900, daily_tech: 40 },
      { uid: "145563254786", nick: "Test Two", power: "998877", sanctuary: { lv: 18 }, x: 5, y: 6, online: false },
    ],
    ...overrides,
  },
});

function response(status, json, headers = {}) {
  return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json", ...headers } });
}

function client(responses, extra = {}) {
  const calls = [];
  const sleeps = [];
  const provider = new LastAsylumTracker({
    apiKey: "lap_secretvalue123",
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => new Date("2026-11-26T12:00:00Z"),
    ...extra,
  });
  return { provider, calls, sleeps };
}

test("normalizes documented alliance fields and drops coordinates and online status", () => {
  const warnings = [];
  const alliance = normalizeAlliance(body(), warnings);
  assert.equal(alliance.externalId, "900000001");
  assert.equal(alliance.kingdom, 324);
  assert.equal(alliance.tag, "TST");
  assert.equal(alliance.members.length, 2);
  const [first, second] = alliance.members;
  assert.equal(first.uid, "145563254785", "character ids beyond 32 bits stay exact");
  assert.equal(first.sanctuaryLevel, 22);
  assert.equal(first.weeklyActivity, 1500);
  assert.equal(first.lastOnlineAt, new Date(1795000000 * 1000).toISOString());
  assert.equal(second.name, "Test Two");
  assert.equal(second.power, 998877);
  assert.equal(second.sanctuaryLevel, 18);
  for (const member of alliance.members) {
    assert.equal("x" in member || "y" in member || "online" in member, false, "location and presence are not carried");
  }
  assert.deepEqual(warnings, []);
});

test("rejects answers without identity and skips malformed or duplicate members", () => {
  assert.throws(() => normalizeAlliance({ alliance: { abbr: "X" } }), (error) => error instanceof ProviderError && error.code === "invalid_response");
  assert.throws(() => normalizeAlliance("nope"), ProviderError);
  const warnings = [];
  const alliance = normalizeAlliance(body({ members: [
    { uid: 1, name: "Test A", power: -5 },
    { uid: 1, name: "Test A again" },
    { name: "No id" },
    "garbage",
    { uid: 2, name: "Test B", power: 1e20 },
  ] }), warnings);
  assert.deepEqual(alliance.members.map((member) => member.uid), ["1", "2"]);
  assert.equal(alliance.members[0].power, null, "negative power is rejected, not stored");
  assert.equal(alliance.members[1].power, null, "absurd power is rejected, not stored");
  assert.ok(warnings.includes("duplicate_member_uid"));
  assert.ok(warnings.includes("member_without_identity"));
  assert.ok(warnings.includes("member_power_out_of_range"));
});

test("missing roster is reported, not treated as an empty alliance", () => {
  const alliance = normalizeAlliance(body({ members: undefined, member_count: 40 }));
  assert.equal(alliance.rosterIncluded, false);
  assert.equal(alliance.memberCount, 40);
});

test("timestamps accept seconds, milliseconds, and ISO; reject nonsense", () => {
  assert.equal(timestamp(1795000000), timestamp(1795000000000));
  assert.equal(timestamp("2026-08-01T00:00:00Z"), "2026-08-01T00:00:00.000Z");
  assert.equal(timestamp(5), null);
  assert.equal(timestamp("yesterday"), null);
});

test("response shape lists field names only", () => {
  const shape = responseShape(body());
  assert.ok(shape.includes("alliance.members"));
  assert.ok(shape.includes("alliance.members[].x"), "reviewers can see the provider sends coordinates");
  assert.ok(responseShape({ data: { result: { aid: 1 } } }).includes("data.result.aid"), "nested envelopes are walked");
  assert.ok(!shape.some((key) => key.includes("Test One") || key.includes("1234567")));
});

test("sends the key as a bearer header with a normal user agent and computes observation time", async () => {
  const { provider, calls } = client([response(200, body(), { "x-cache": "hit" })]);
  const result = await provider.fetchAlliance("900000001", { fresh: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.lastasylumtracker.com/v1/alliances/900000001?fresh=1");
  assert.equal(calls[0].init.headers.Authorization, "Bearer lap_secretvalue123");
  assert.match(calls[0].init.headers["User-Agent"], /BurnFireIntel/);
  assert.equal(result.ageSeconds, 120);
  assert.equal(result.observedAt.toISOString(), "2026-11-26T11:58:00.000Z");
  assert.deepEqual(result.quota, { limit: 1000, remaining: 997, resets: "00:00 UTC" });
});

test("tag lookups strip brackets and keep capitalization", async () => {
  const { provider, calls } = client([response(200, body())]);
  await provider.findAlliance(324, "[TsT]");
  assert.equal(calls[0].url, "https://api.lastasylumtracker.com/v1/alliances/324/TsT");
  await assert.rejects(provider.findAlliance(324, "../../admin"), (error) => error.code === "not_found");
});

test("missing key fails before any network request", async () => {
  const { provider, calls } = client([], { apiKey: "" });
  await assert.rejects(provider.fetchAlliance("1"), (error) => error.code === "missing_key" && error.attempts === 0);
  assert.equal(calls.length, 0);
});

test("authentication failures, not-found, and ambiguity are not retried", async () => {
  for (const [status, code] of [[401, "auth"], [404, "not_found"], [409, "ambiguous"]]) {
    const { provider, calls } = client([response(status, { detail: "x", matches: [{ tag: "A" }] })]);
    await assert.rejects(provider.fetchAlliance("1"), (error) => error.code === code);
    assert.equal(calls.length, 1, `${status} is final`);
  }
});

test("rate limits stop immediately and expose the quota", async () => {
  const { provider, calls } = client([response(429, { quota: { limit: 1000, remaining: 0 } }, { "x-ratelimit-remaining": "0" })]);
  await assert.rejects(provider.fetchAlliance("1"), (error) => error.code === "rate_limited" && error.quota.remaining === 0);
  assert.equal(calls.length, 1);
});

test("busy, timeout, and network errors retry with exponential backoff up to the limit", async () => {
  const { provider, calls, sleeps } = client([
    response(503, {}), response(504, {}), response(200, body()),
  ]);
  const result = await provider.fetchAlliance("1");
  assert.equal(result.attempts, 3);
  assert.equal(calls.length, 3);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[1] > sleeps[0], "delay grows");

  const outage = client([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await assert.rejects(outage.provider.fetchAlliance("1"), (error) => error.code === "network" && error.attempts === 3);
  assert.equal(outage.calls.length, 3);
  assert.equal(backoffMs(1, () => 0), 1000);
  assert.equal(backoffMs(10, () => 0), 8000, "backoff is capped");
});

test("secrets are redacted from any stored or logged text", () => {
  const leaked = "failed with Authorization: Bearer lap_abc123XYZ and X-API-Key: lap_zzz";
  const clean = redactSecrets(leaked);
  assert.ok(!clean.includes("abc123XYZ"));
  assert.ok(!clean.includes("lap_zzz"));
  assert.ok(clean.length <= 300);
});

test("an unparseable answer reports its field names so the parser can be corrected", async () => {
  const { provider } = client([response(200, { data: { alliance_info: { foo: 1 } } })]);
  await assert.rejects(provider.fetchAlliance("1"), (error) =>
    error.code === "invalid_response" && error.status === 200 && error.shape.includes("data.alliance_info.foo"));
});

// TEST DATA: synthetic values in the field layout of a live answer observed on
// 2026-11-26 (field names recorded by the integration; no real values used).
test("parses the live answer layout: union_id, sid, nick_name, capacity, rank labels", () => {
  const live = {
    ok: true, cached: true, age_seconds: 300, cache_seconds: 3600, refreshing: false, live: false,
    quota: { limit: 1000, used: 2, remaining: 998, resets: "00:00 UTC", patron: false },
    union_id: 900000009, sid: 324, abbr: "TST", name: "Test Alliance", level: 6, member_count: 2, capacity: 60,
    power: 123456789, rank: { rank: 12, score: 123456789 }, leader_id: 1, leader_name: "Test Leader",
    join: { auto: true, castle_level: 10, power: 0 }, updated_at: "2026-11-26T03:00:00Z",
    members: [
      { uid: 1001, aid: 900000009, kid: 324, nick_name: "Test A", power: 5000000, lv: 21, rank_code: 5, rank_label: "R5",
        active: 1200, daily_honor: 300, daily_tech: 20, joined_at: "2026-09-01T00:00:00Z", last_online_at: "2026-11-26T02:00:00Z",
        online: true, x: 1, y: 2, kills: 10 },
      { uid: 1002, aid: 900000009, kid: 324, nick_name: "Test B", power: 3000000, lv: 18, rank_label: "R1", online: false, x: 3, y: 4 },
    ],
  };
  const alliance = normalizeAlliance(live);
  assert.equal(alliance.externalId, "900000009");
  assert.equal(alliance.kingdom, 324);
  assert.equal(alliance.capacity, 60);
  assert.equal(alliance.reportedPower, 123456789);
  assert.deepEqual(alliance.members.map((member) => [member.name, member.sanctuaryLevel, member.rank]), [["Test A", 21, "R5"], ["Test B", 18, "R1"]]);
  for (const member of alliance.members) assert.equal("x" in member || "online" in member, false);
});
