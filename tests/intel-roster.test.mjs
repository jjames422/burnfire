import assert from "node:assert/strict";
import test from "node:test";
import { matchRoster } from "../lib/intel/roster-match.ts";
import { normalizeRank, titlesAfter } from "../lib/intel/roster-sync.ts";

// TEST DATA: synthetic roster rows.
const roster = [
  { player_id: "p1", uid: "1001", name: "Test Alpha", rank_label: "R3" },
  { player_id: "p2", uid: "1002", name: "Test Twin", rank_label: "R1" },
  { player_id: "p3", uid: "1003", name: "test twin", rank_label: "R2" },
  { player_id: "p4", uid: "1004", name: "Test Unranked", rank_label: null },
];

test("roster ranks normalize from game labels", () => {
  assert.equal(normalizeRank("R4"), "r4");
  assert.equal(normalizeRank("r1"), "r1");
  assert.equal(normalizeRank("5"), "r5");
  assert.equal(normalizeRank("Leader"), "r5");
  assert.equal(normalizeRank("R9"), null);
  assert.equal(normalizeRank(null), null);
});

test("an application matches only when ID, name, and rank agree with the game", () => {
  const ok = matchRoster(roster, { identifier: "1001", name: "test alpha", rank: "r3" });
  assert.equal(ok.status, "match");
  assert.deepEqual(ok.checks, { found: true, name: true, rank: true });
  assert.equal(matchRoster(roster, { identifier: "1001", name: "Test Alpha", rank: "r4" }).status, "mismatch");
  assert.equal(matchRoster(roster, { identifier: "1001", name: "Someone Else", rank: "r3" }).checks.name, false);
  assert.equal(matchRoster(roster, { identifier: "9999", name: "Nobody", rank: "r1" }).status, "not_found");
  assert.equal(matchRoster(roster, { identifier: "Test Twin", name: "Test Twin", rank: "r1" }).status, "ambiguous");
  assert.equal(matchRoster(roster, { identifier: "1003", name: "test twin", rank: "r2" }).status, "match", "an ID resolves shared names");
  assert.equal(matchRoster(roster, { identifier: "Test Alpha", name: null, rank: "r3" }).status, "match", "a name works as the identifier");
  assert.equal(matchRoster(roster, { identifier: "1004", name: "Test Unranked", rank: "r2" }).status, "rank_unknown");
});

test("titles follow the schema's rank rules after an automatic change", () => {
  assert.deepEqual(titlesAfter("r5", { rank: "r4", title: "diplomat", regent: true }), { title: "alliance_leader", regent: false });
  assert.deepEqual(titlesAfter("r4", { rank: "r4", title: "diplomat", regent: true }), { title: "diplomat", regent: true });
  assert.deepEqual(titlesAfter("r4", { rank: "r5", title: "alliance_leader", regent: false }), { title: null, regent: false });
  assert.deepEqual(titlesAfter("r3", { rank: "r4", title: "recruiter", regent: true }), { title: null, regent: false });
});
