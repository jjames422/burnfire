import assert from "node:assert/strict";
import test from "node:test";
import {
  DAY, HOUR, assessActivity, contributionTotal, dailyClose, distribution, growthOver, growthPercentile,
  missingDays, trackedStandings,
} from "../lib/intel/analytics.ts";
import { aggregateRoster, budgetAllows, failureDelayMinutes, minutesUntilQuotaReset } from "../lib/intel/sync.ts";

const now = Date.UTC(2026, 10, 26, 12);
const series = (days, start = 1000, perDay = 10) =>
  Array.from({ length: days + 1 }, (_, index) => ({ t: now - (days - index) * DAY, v: start + index * perDay }));

test("growth is computed only when history reaches the window", () => {
  const growth = growthOver(series(10), 7 * DAY);
  assert.equal(growth.available, true);
  assert.equal(growth.delta, 70);
  assert.ok(Math.abs(growth.percent - (70 / 1030) * 100) < 1e-9);
  assert.deepEqual(growthOver(series(10), 30 * DAY), { available: false, reason: "insufficient_history" });
  assert.deepEqual(growthOver([], DAY), { available: false, reason: "no_data" });
});

test("a gap around the window start is reported instead of bridged", () => {
  const points = [{ t: now - 20 * DAY, v: 500 }, { t: now - DAY, v: 900 }, { t: now, v: 1000 }];
  assert.equal(growthOver(points, 7 * DAY).available, false);
});

test("daily close keeps the last observation per UTC day and gaps are counted", () => {
  const points = [{ t: now - 2 * HOUR, v: 1 }, { t: now - HOUR, v: 2 }, { t: now - 3 * DAY, v: 0 }];
  assert.deepEqual(dailyClose(points).map((point) => point.v), [0, 2]);
  assert.equal(missingDays(points, now - 3 * DAY, now), 2);
});

test("weekly contributions sum each day's peak and report coverage", () => {
  const samples = [
    { t: now - 3 * HOUR, v: 100 }, { t: now - HOUR, v: 400 },
    { t: now - DAY, v: 250 },
    { t: now - 9 * DAY, v: 9999 },
  ];
  assert.deepEqual(contributionTotal(samples, now, 7), { total: 650, observedDays: 2, days: 7 });
});

test("growth percentile uses percentage growth so smaller accounts are compared fairly", () => {
  assert.equal(growthPercentile(5, [1, 2]), null, "too few peers");
  assert.equal(growthPercentile(5, [1, 2, 3, 5, 9]), 70);
});

test("sanctuary distribution counts levels and ignores missing values", () => {
  assert.deepEqual(distribution([20, 20, 18, null]), [{ level: 20, count: 2 }, { level: 18, count: 1 }]);
});

test("tracked standings rank only alliances with data and report movement", () => {
  const rows = [
    { id: "a", totalPower: 100, previousTotalPower: 90 },
    { id: "b", totalPower: 120, previousTotalPower: 80 },
    { id: "c", totalPower: null, previousTotalPower: 200 },
  ];
  assert.deepEqual(trackedStandings(rows), [
    { id: "a", position: 2, change: -1 },
    { id: "b", position: 1, change: 1 },
    { id: "c", position: null, change: null },
  ]);
});

const base = {
  now, thresholdDays: 7, lastObservedAt: now - HOUR, lastOnlineAt: null, joinedAt: now - 60 * DAY,
  onApprovedAbsence: false, power: series(9), weeklyActivity: 100,
};

test("flat power alone only asks for review; it is never treated as inactivity", () => {
  const flat = Array.from({ length: 10 }, (_, index) => ({ t: now - (9 - index) * DAY, v: 500 }));
  assert.deepEqual(assessActivity({ ...base, power: flat }), { state: "needs_review", reasons: ["no_power_growth"] });
  assert.equal(assessActivity(base).state, "active");
});

test("only a reliable last-online value beyond the threshold suggests inactivity", () => {
  assert.equal(assessActivity({ ...base, lastOnlineAt: now - 8 * DAY }).state, "likely_inactive");
  assert.equal(assessActivity({ ...base, lastOnlineAt: now - 2 * DAY }).state, "active");
});

test("absences, stale data, short history, and new members are never flagged", () => {
  assert.equal(assessActivity({ ...base, lastOnlineAt: now - 30 * DAY, onApprovedAbsence: true }).state, "excused");
  assert.equal(assessActivity({ ...base, lastObservedAt: now - 3 * DAY, lastOnlineAt: now - 30 * DAY }).state, "insufficient_data");
  assert.equal(assessActivity({ ...base, power: series(3) }).state, "insufficient_data");
  assert.equal(assessActivity({ ...base, joinedAt: now - 2 * DAY, lastOnlineAt: now - 30 * DAY }).state, "new_member");
});

test("roster aggregation reports partial power coverage instead of hiding it", () => {
  const aggregate = aggregateRoster({
    externalId: "1", kingdom: 324, tag: "T", name: "Test", level: 1, memberCount: 3, rosterIncluded: true,
    members: [
      { uid: "1", name: "a", power: 100, sanctuaryLevel: 20 },
      { uid: "2", name: "b", power: 300, sanctuaryLevel: 20 },
    ],
  });
  assert.equal(aggregate.totalPower, 400);
  assert.equal(aggregate.averagePower, 200);
  assert.equal(aggregate.membersWithPower, 2);
  assert.equal(aggregate.rosterComplete, false, "two of three members cannot prove departures");
  assert.deepEqual(aggregate.sanctuaryLevels, { 20: 2 });
});

test("quota reserve protects the home alliance; account errors pause instead of retrying", () => {
  const budget = { remaining: 60, limit: 1000, reserve: 100, usedToday: 940, known: true };
  assert.equal(budgetAllows(budget, false, "schedule"), false);
  assert.equal(budgetAllows(budget, true, "schedule"), true);
  assert.equal(budgetAllows({ ...budget, remaining: 5 }, true, "schedule"), false);
  assert.equal(failureDelayMinutes(60, 1, "unavailable"), 30);
  assert.equal(failureDelayMinutes(60, 3, "unavailable"), 120);
  assert.equal(failureDelayMinutes(60, 20, "unavailable"), 24 * 60, "backoff is capped at a day");
  assert.equal(failureDelayMinutes(60, 1, "rate_limited"), -1);
  assert.equal(minutesUntilQuotaReset(new Date(Date.UTC(2026, 10, 26, 23, 0))), 65);
});

test("the provider's own alliance total is preferred over summing members", () => {
  const aggregate = aggregateRoster({
    externalId: "1", kingdom: 324, tag: "T", name: "Test", level: 1, memberCount: 4, capacity: 60, reportedPower: 1000, rosterIncluded: true,
    members: [{ uid: "1", name: "a", power: 100, sanctuaryLevel: 20 }],
  });
  assert.equal(aggregate.totalPower, 1000);
  assert.equal(aggregate.averagePower, 250);
  assert.equal(aggregate.membersWithPower, 4, "a provider total covers every member");
});
