import assert from "node:assert/strict";
import test from "node:test";
import { REPORT_AUDIENCE, buildReport, periodKey } from "../lib/intel/reports.ts";
import { secretMatches } from "../lib/intel/secret.ts";
import { ticks } from "../lib/intel/format.ts";

// TEST DATA: synthetic report inputs.
const input = {
  kind: "daily", siteUrl: "https://portal.example.invalid/", tag: "TST", synthetic: false, observedAt: "2026-11-26T10:00:00.000Z",
  totalPower: 21_000_000, memberCount: 46, capacity: 50, growth24h: 50_000, growth7d: 360_000, growth7dPct: 1.7,
  joined: ["Test New"], left: ["Test Gone"], topGrowth: [{ name: "Test Fast", pct: 2.8 }], honor7d: 340_000, tech7d: 190_000,
  standings: [{ tag: "TA2", position: 1, change: 0, isHome: false }, { tag: "TST", position: 2, change: 1, isHome: true }],
  renames: [], reviewNames: ["Test Flagged"], openReviews: 1, absencesEnding: [], syncFailures: 2,
};

test("alliance-wide reports never name members for inactivity review", () => {
  for (const kind of ["daily", "weekly", "kingdom"]) {
    const report = buildReport({ ...input, kind });
    assert.equal(report.audience, "alliance");
    assert.ok(!report.lines.join(" ").includes("Test Flagged"), `${kind} leaks a review name`);
  }
  const leadership = buildReport({ ...input, kind: "leadership" });
  assert.equal(leadership.audience, "leadership");
  assert.ok(leadership.lines.join(" ").includes("Test Flagged"));
  assert.ok(leadership.lines.some((line) => line.includes("not verdicts")));
  assert.equal(REPORT_AUDIENCE.leadership, "leadership");
});

test("reports link back to the site and label kingdom order and synthetic data honestly", () => {
  assert.equal(buildReport(input).url, "https://portal.example.invalid/intel");
  assert.equal(buildReport({ ...input, kind: "kingdom" }).url, "https://portal.example.invalid/intel/kingdom");
  assert.ok(buildReport({ ...input, kind: "kingdom" }).lines.some((line) => line.includes("not the official kingdom ranking")));
  assert.match(buildReport({ ...input, synthetic: true }).lines[0], /SYNTHETIC TEST DATA/);
  assert.ok(buildReport({ ...input, observedAt: null }).lines.includes("No verified data yet"));
});

test("report periods deduplicate per day and per ISO-like week", () => {
  const monday = new Date("2026-11-23T09:00:00Z");
  assert.equal(periodKey("daily", monday), "daily:2026-11-23");
  assert.equal(periodKey("weekly", monday), periodKey("weekly", new Date("2026-11-24T09:00:00Z")));
});

test("machine secrets require a long secret and an exact bearer match", () => {
  const secret = "s".repeat(40);
  assert.equal(secretMatches(`Bearer ${secret}`, secret), true);
  assert.equal(secretMatches(`Bearer ${secret}x`, secret), false);
  assert.equal(secretMatches(secret, secret), false, "scheme required");
  assert.equal(secretMatches("Bearer short", "short"), false, "short secrets are refused even when they match");
  assert.equal(secretMatches(null, secret), false);
  assert.equal(secretMatches(`Bearer ${secret}`, undefined), false);
});

test("axis ticks always cover the data so no mark rises above the top gridline", () => {
  for (const [min, max] of [[220_000, 287_300], [19e6, 20.96e6], [0, 1], [5, 5]]) {
    const values = ticks(min, max);
    assert.ok(values[0] <= min && values[values.length - 1] >= max, `${min}-${max}`);
  }
  assert.deepEqual(ticks(16, 17, 3, true), [16, 17], "integer data gets whole-number ticks");
});

test("server day counts the opening day as day 1 and classifies milestones", async () => {
  const { serverDay, dateOfDay, progression } = await import("../lib/intel/progression.ts");
  assert.equal(serverDay("2026-08-13", Date.parse("2026-11-26T04:00:00Z")), 106);
  assert.equal(serverDay("2026-08-13", Date.parse("2026-08-13T23:59:00Z")), 1);
  assert.equal(dateOfDay("2026-08-13", 120), "2026-12-10");
  const milestones = [
    { id: "a", start_day: 99, end_day: 105, title: "Test past", kind: "event", certainty: "confirmed", notes: null },
    { id: "b", start_day: 100, end_day: 110, title: "Test current", kind: "event", certainty: "confirmed", notes: null },
    { id: "c", start_day: 120, end_day: null, title: "Test next", kind: "unlock", certainty: "estimated", notes: null },
  ];
  const state = progression(106, milestones);
  assert.deepEqual(state.past.map((m) => m.id), ["a"]);
  assert.deepEqual(state.current.map((m) => m.id), ["b"]);
  assert.deepEqual(state.upcoming.map((m) => [m.id, m.in_days]), [["c", 14]]);
});
