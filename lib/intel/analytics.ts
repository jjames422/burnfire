// Pure calculations over stored snapshots. Nothing here invents a value:
// when history does not reach back far enough the result says so.

export interface Point { t: number; v: number }

export type Growth =
  | { available: true; from: number; to: number; delta: number; percent: number | null; fromTime: number; toTime: number }
  | { available: false; reason: "no_data" | "insufficient_history" };

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const GROWTH_WINDOWS = [
  { key: "24h", ms: DAY },
  { key: "7d", ms: 7 * DAY },
  { key: "30d", ms: 30 * DAY },
  { key: "90d", ms: 90 * DAY },
] as const;

/** Allowed distance between the requested start time and a stored point. */
export function toleranceFor(windowMs: number): number {
  return Math.max(3 * HOUR, Math.round(windowMs * 0.15));
}

/**
 * Growth between the latest point and the point nearest to (latest - window).
 * Returns insufficient_history when no stored point is close enough.
 */
export function growthOver(series: Point[], windowMs: number): Growth {
  const points = series.filter((point) => Number.isFinite(point.v)).sort((a, b) => a.t - b.t);
  if (!points.length) return { available: false, reason: "no_data" };
  const latest = points[points.length - 1];
  const target = latest.t - windowMs;
  let best: Point | null = null;
  for (const point of points) {
    if (point.t > latest.t - windowMs / 2) break;
    if (!best || Math.abs(point.t - target) < Math.abs(best.t - target)) best = point;
  }
  if (!best || Math.abs(best.t - target) > toleranceFor(windowMs)) return { available: false, reason: "insufficient_history" };
  const delta = latest.v - best.v;
  return {
    available: true,
    from: best.v,
    to: latest.v,
    delta,
    percent: best.v > 0 ? (delta / best.v) * 100 : null,
    fromTime: best.t,
    toTime: latest.t,
  };
}

/** Points per UTC day: the last observation of each day. */
export function dailyClose(series: Point[]): Point[] {
  const byDay = new Map<number, Point>();
  for (const point of series) {
    const day = Math.floor(point.t / DAY);
    const current = byDay.get(day);
    if (!current || point.t > current.t) byDay.set(day, point);
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

/** Days inside [start, end] with no observation at all. */
export function missingDays(series: Point[], start: number, end: number): number {
  const days = new Set(series.map((point) => Math.floor(point.t / DAY)));
  let missing = 0;
  for (let day = Math.floor(start / DAY); day <= Math.floor(end / DAY); day += 1) if (!days.has(day)) missing += 1;
  return missing;
}

/**
 * Daily counters (honor, tech donations) reset each game day. The best
 * available daily total is the highest value seen during that UTC day.
 * Returns the sum over the last `days` days plus how many of them were observed.
 */
export function contributionTotal(samples: Point[], now: number, days = 7): { total: number; observedDays: number; days: number } {
  const start = Math.floor(now / DAY) - days + 1;
  const peak = new Map<number, number>();
  for (const sample of samples) {
    const day = Math.floor(sample.t / DAY);
    if (day < start || !Number.isFinite(sample.v)) continue;
    peak.set(day, Math.max(peak.get(day) ?? 0, sample.v));
  }
  let total = 0;
  for (const value of peak.values()) total += value;
  return { total, observedDays: peak.size, days };
}

export function distribution(values: (number | null)[]): { level: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const value of values) if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([level, count]) => ({ level, count })).sort((a, b) => b.level - a.level);
}

export function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Percentile of a member's percentage growth among members with comparable
 * data. Percentage growth keeps smaller accounts on equal footing with
 * larger ones; absolute power is never used for this comparison.
 */
export function growthPercentile(own: number, peers: number[]): number | null {
  const valid = peers.filter(Number.isFinite);
  if (valid.length < 3) return null;
  const below = valid.filter((value) => value < own).length;
  const equal = valid.filter((value) => value === own).length;
  return Math.round(((below + equal / 2) / valid.length) * 100);
}

export interface StandingInput {
  id: string;
  totalPower: number | null;
  previousTotalPower: number | null;
}

/** Order among tracked alliances only, with movement versus the previous order. */
export function trackedStandings(rows: StandingInput[]): { id: string; position: number | null; change: number | null }[] {
  // Both orders use the same set (alliances with current data) so movement
  // reflects real changes, not alliances dropping out of the comparison.
  const comparable = rows.filter((row) => row.totalPower !== null);
  const rank = (key: "totalPower" | "previousTotalPower") => {
    const ordered = comparable.filter((row) => row[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number));
    return new Map(ordered.map((row, index) => [row.id, index + 1]));
  };
  const now = rank("totalPower");
  const before = rank("previousTotalPower");
  return rows.map((row) => {
    const position = now.get(row.id) ?? null;
    const previous = before.get(row.id) ?? null;
    return { id: row.id, position, change: position !== null && previous !== null ? previous - position : null };
  });
}

export type ActivityState = "active" | "new_member" | "excused" | "needs_review" | "likely_inactive" | "insufficient_data";

export interface ActivityInput {
  now: number;
  thresholdDays: number;
  /** Latest provider observation of this member. */
  lastObservedAt: number | null;
  /** Provider's last-online value; the strongest available signal. */
  lastOnlineAt: number | null;
  joinedAt: number | null;
  onApprovedAbsence: boolean;
  /** Power observations during the threshold window plus one before it. */
  power: Point[];
  weeklyActivity: number | null;
}

/**
 * Flags members for leadership review. A lack of power growth alone never
 * classifies anyone as inactive: it can only raise "needs_review". Only a
 * fresh provider last-online value older than the threshold produces
 * "likely_inactive", and even that is a prompt for a human decision.
 */
export function assessActivity(input: ActivityInput): { state: ActivityState; reasons: string[] } {
  const threshold = input.thresholdDays * DAY;
  if (input.onApprovedAbsence) return { state: "excused", reasons: ["approved_absence"] };
  if (input.lastObservedAt === null || input.now - input.lastObservedAt > 2 * DAY) {
    return { state: "insufficient_data", reasons: ["stale_or_missing_data"] };
  }
  if (input.joinedAt !== null && input.now - input.joinedAt < threshold) return { state: "new_member", reasons: ["joined_recently"] };
  if (input.lastOnlineAt !== null) {
    return input.now - input.lastOnlineAt >= threshold
      ? { state: "likely_inactive", reasons: ["last_online_beyond_threshold"] }
      : { state: "active", reasons: ["seen_online_recently"] };
  }
  const window = input.power.filter((point) => point.t >= input.now - threshold - DAY).sort((a, b) => a.t - b.t);
  const coversWindow = window.length >= 2 && window[0].t <= input.now - threshold + DAY / 2;
  if (!coversWindow) return { state: "insufficient_data", reasons: ["history_shorter_than_threshold"] };
  const grew = window[window.length - 1].v > window[0].v;
  const reasons: string[] = [];
  if (!grew) reasons.push("no_power_growth");
  if (input.weeklyActivity === 0) reasons.push("no_weekly_activity");
  return reasons.length ? { state: "needs_review", reasons } : { state: "active", reasons: ["power_growth"] };
}
