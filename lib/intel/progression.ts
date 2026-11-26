// Server-age progression. Day 1 is the kingdom's opening date (UTC days, matching the 00:00 UTC reset).

const DAY = 86_400_000;

export interface Milestone {
  id: string; start_day: number; end_day: number | null; title: string;
  kind: "event" | "season" | "unlock" | "other"; certainty: "confirmed" | "estimated"; notes: string | null;
}

export function serverDay(openedOn: string, now = Date.now()): number | null {
  const opened = Date.parse(`${openedOn}T00:00:00Z`);
  if (!Number.isFinite(opened)) return null;
  const today = Math.floor(now / DAY) * DAY;
  return Math.floor((today - opened) / DAY) + 1;
}

/** The calendar date (YYYY-MM-DD) of a server day. */
export function dateOfDay(openedOn: string, day: number): string {
  return new Date(Date.parse(`${openedOn}T00:00:00Z`) + (day - 1) * DAY).toISOString().slice(0, 10);
}

export function progression(day: number, milestones: Milestone[]) {
  const sorted = [...milestones].sort((a, b) => a.start_day - b.start_day);
  const lastDay = (m: Milestone) => m.end_day ?? m.start_day;
  return {
    current: sorted.filter((m) => m.start_day <= day && lastDay(m) >= day),
    past: sorted.filter((m) => lastDay(m) < day),
    upcoming: sorted.filter((m) => m.start_day > day).map((m) => ({ ...m, in_days: m.start_day - day })),
  };
}
