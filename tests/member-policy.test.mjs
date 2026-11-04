import assert from "node:assert/strict";
import test from "node:test";
import { canAppointRegent, canAssignRank, isAllianceRank, permissionForRank } from "../lib/command/member-policy.ts";
import { formatMemberIdentity, validTitleForRank, R4_TITLES, TITLE_LABELS } from "../lib/identity.ts";
import { hasOfficerAccess } from "../lib/command/access.ts";

test("R3 and R4 ranks carry officer chat access without implying site administration", () => {
  assert.equal(permissionForRank("r1"), "member");
  assert.equal(permissionForRank("r2"), "member");
  assert.equal(permissionForRank("r3"), "officer");
  assert.equal(permissionForRank("r4"), "officer");
  assert.equal(permissionForRank("r5"), "admin");
});

test("Regent gains alliance-level R5 access without R5 or Regent appointment powers", () => {
  assert.equal(hasOfficerAccess("r4", "r5", true), true);
  assert.equal(hasOfficerAccess("r4", "r5", false), false);
  assert.equal(hasOfficerAccess("r3", "r5", true), false);
  assert.equal(hasOfficerAccess(null, "r5", true), false);
  assert.equal(canAssignRank("r4", false, "r4", "r4", true), true);
  assert.equal(canAssignRank("r4", false, "r4", "r3", true), true);
  assert.equal(canAssignRank("r4", false, "r5", "r4", true), false);
  assert.equal(canAssignRank("r4", false, "r4", "r5", true), false);
  assert.equal(canAppointRegent("r4", false), false);
  assert.equal(canAppointRegent("r5", false), true);
  assert.equal(canAppointRegent("r4", true), true);
});

test("identity keeps Regent and the special title together while R5 always displays Alliance Leader", () => {
  const member = { inGameName: "Player", allianceCode: "BF", gameRank: "r4", allianceTitle: "diplomat", isRegent: true };
  assert.equal(formatMemberIdentity(member), "[BF] Player · Regent · Diplomat");
  assert.equal(formatMemberIdentity({ ...member, isRegent: false }), "[BF] Player · Diplomat");
  assert.equal(formatMemberIdentity({ ...member, gameRank: "r5" }), "[BF] Player · Alliance Leader");
});

test("only leadership can approve ranks below their own, while site administration is independent", () => {
  assert.equal(canAssignRank("r3", false, "r1", "r2"), false);
  assert.equal(canAssignRank("r4", false, null, "r1"), true);
  assert.equal(canAssignRank("r4", false, "r2", "r3"), true);
  assert.equal(canAssignRank("r4", false, "r3", "r4"), false);
  assert.equal(canAssignRank("r4", false, "r4", "r2"), false);
  assert.equal(canAssignRank("r5", false, "r4", "r3"), true);
  assert.equal(canAssignRank("r5", false, "r4", "r5"), false);
  assert.equal(canAssignRank("r4", true, "r5", "r4"), true);
  assert.equal(canAssignRank(null, true, "r4", "r5"), true);
});

test("rank input is validated against the shared membership ranks", () => {
  for (const rank of ["r1", "r2", "r3", "r4", "r5"]) assert.equal(isAllianceRank(rank), true);
  for (const value of ["admin", "R4", "", null, {}, 4]) assert.equal(isAllianceRank(value), false);
});

test("titles are rank-specific and R5 is always Alliance Leader", () => {
  for (const rank of ["r1", "r2", "r3"]) {
    assert.equal(validTitleForRank(rank, null), true);
    for (const title of Object.keys(TITLE_LABELS)) assert.equal(validTitleForRank(rank, title), false);
  }
  for (const title of R4_TITLES) assert.equal(validTitleForRank("r4", title), true);
  assert.equal(validTitleForRank("r4", null), true);
  assert.equal(validTitleForRank("r4", "alliance_leader"), false);
  assert.equal(validTitleForRank("r4", "site_admin"), false);
  assert.equal(validTitleForRank("r5", "alliance_leader"), true);
  assert.equal(validTitleForRank("r5", null), false);
  assert.equal(validTitleForRank("r5", "goddess"), false);
});
