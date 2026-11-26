// SYNTHETIC TEST DATA. Deterministic stand-in for a real provider so the
// interface and synchronization can be developed before an API key exists.
// Every name is visibly fictional ("Test ..."), ids are outside the real
// tracker's alliance range, and the provider id "fixture" never mixes with
// real provider rows. It is registered only outside production.

import { ProviderError, type IntelProvider, type NormalizedAlliance, type NormalizedMember, type ProviderResult } from "./types.ts";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 6, 1);

export interface FixtureAllianceSpec {
  externalId: string;
  tag: string;
  name: string;
  members: number;
  basePower: number;
  dailyGrowth: number;
  level: number;
  renameAt?: { at: number; tag: string; name: string };
}

export const FIXTURE_HOME_ID = "900000001";

export const FIXTURE_ALLIANCES: FixtureAllianceSpec[] = [
  { externalId: FIXTURE_HOME_ID, tag: "TST", name: "Test Home Alliance", members: 46, basePower: 9_400_000, dailyGrowth: 0.0042, level: 7 },
  { externalId: "900000002", tag: "TA2", name: "Test Alliance Two", members: 50, basePower: 14_800_000, dailyGrowth: 0.0021, level: 8 },
  { externalId: "900000003", tag: "TA3", name: "Test Alliance Three", members: 39, basePower: 8_100_000, dailyGrowth: 0.0055, level: 6,
    renameAt: { at: Date.UTC(2026, 10, 10), tag: "TA3X", name: "Test Alliance Three Reformed" } },
  { externalId: "900000004", tag: "TA4", name: "Test Alliance Four", members: 48, basePower: 11_900_000, dailyGrowth: 0.0012, level: 7 },
  { externalId: "900000005", tag: "TA5", name: "Test Alliance Five", members: 27, basePower: 4_300_000, dailyGrowth: 0.0068, level: 5 },
];

function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function memberPower(spec: FixtureAllianceSpec, index: number, at: number): number {
  const share = 0.35 + 1.9 * noise(Number(spec.externalId) + index * 7.1);
  const base = (spec.basePower / spec.members) * share;
  const pace = spec.dailyGrowth * (0.2 + 1.6 * noise(index * 3.3 + 1));
  // Two members in the home alliance stop growing from mid-November.
  const stalled = spec.externalId === FIXTURE_HOME_ID && (index === 7 || index === 19) ? Math.min(at, Date.UTC(2026, 10, 16)) : at;
  const days = (stalled - EPOCH) / DAY;
  const wobble = 1 + 0.004 * Math.sin(days * 1.7 + index);
  return Math.round(base * (1 + pace * days) * wobble);
}

export function syntheticAlliance(spec: FixtureAllianceSpec, atDate: Date): NormalizedAlliance {
  const at = atDate.getTime();
  const renamed = spec.renameAt && at >= spec.renameAt.at;
  const home = spec.externalId === FIXTURE_HOME_ID;
  const members: NormalizedMember[] = [];
  for (let index = 0; index < spec.members + (home ? 1 : 0); index += 1) {
    // Home roster events: #12 leaves on Nov 12, #46 joins on Nov 14, #3 renames on Nov 8.
    if (home && index === 12 && at >= Date.UTC(2026, 10, 12)) continue;
    if (home && index === spec.members && at < Date.UTC(2026, 10, 14)) continue;
    const number = String(index + 1).padStart(2, "0");
    const name = home && index === 3 && at >= Date.UTC(2026, 10, 8) ? "Test Member 04 Renamed" : `Test Member ${number}`;
    const power = memberPower(spec, index, at);
    const daySeed = Math.floor(at / DAY) + index * 31;
    const idle = home && (index === 7 || index === 19) && at >= Date.UTC(2026, 10, 16);
    members.push({
      uid: String(Number(spec.externalId) * 1000 + index),
      name,
      power,
      sanctuaryLevel: Math.min(30, Math.max(8, Math.round(10 + Math.log10(power / 50_000) * 7 + noise(index) * 3))),
      dailyHonor: idle ? 0 : Math.round(200 + noise(daySeed) * 1800),
      dailyTech: idle ? 0 : Math.round(noise(daySeed + 5) * 1200),
      weeklyActivity: idle ? 0 : Math.round(400 + noise(daySeed + 9) * 3000),
      joinedAt: new Date(home && index === spec.members ? Date.UTC(2026, 10, 14) : EPOCH - (index + 3) * 4 * DAY).toISOString(),
      lastOnlineAt: new Date(idle ? Date.UTC(2026, 10, 16, 6) : at - Math.round(noise(daySeed + 2) * 20) * 3_600_000).toISOString(),
      rank: index === 0 ? "R5" : index < 4 ? "R4" : index < 10 ? "R3" : index < 25 ? "R2" : "R1",
    });
  }
  return {
    externalId: spec.externalId,
    kingdom: 324,
    tag: renamed ? spec.renameAt!.tag : spec.tag,
    name: renamed ? spec.renameAt!.name : spec.name,
    level: spec.level,
    memberCount: members.length,
    capacity: null,
    reportedPower: null,
    rosterIncluded: true,
    members,
  };
}

export function fixtureResult(data: NormalizedAlliance, at: Date): ProviderResult<NormalizedAlliance> {
  return {
    data, fetchedAt: at, observedAt: at, cached: false, ageSeconds: 0, refreshing: false,
    quota: { limit: null, remaining: null, resets: null }, httpStatus: 200, attempts: 1,
    shape: ["synthetic_fixture"], warnings: [],
  };
}

export class FixtureProvider implements IntelProvider {
  readonly id = "fixture";
  readonly synthetic = true;
  private readonly now: () => Date;
  constructor(now: () => Date = () => new Date()) { this.now = now; }

  async fetchAlliance(externalId: string) {
    const spec = FIXTURE_ALLIANCES.find((item) => item.externalId === externalId);
    if (!spec) throw new ProviderError("not_found", "No synthetic alliance with that id.", { status: 404 });
    const at = this.now();
    return fixtureResult(syntheticAlliance(spec, at), at);
  }

  async findAlliance(kingdom: number, tag: string) {
    const at = this.now();
    const spec = FIXTURE_ALLIANCES.find((item) => kingdom === 324 && syntheticAlliance(item, at).tag.toLowerCase() === tag.replace(/^\[|\]$/g, "").toLowerCase());
    if (!spec) throw new ProviderError("not_found", "No synthetic alliance with that tag.", { status: 404 });
    return fixtureResult(syntheticAlliance(spec, at), at);
  }
}
