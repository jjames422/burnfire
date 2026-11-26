// Community-bot report text. Pure formatting so audiences can be tested:
// "alliance" reports go to member channels and never name anyone for
// inactivity; "leadership" reports are for restricted officer channels.

export type ReportKind = "daily" | "weekly" | "kingdom" | "leadership";
export type Audience = "alliance" | "leadership";

export const REPORT_AUDIENCE: Record<ReportKind, Audience> = {
  daily: "alliance",
  weekly: "alliance",
  kingdom: "alliance",
  leadership: "leadership",
};

export interface ReportInput {
  kind: ReportKind;
  siteUrl: string;
  tag: string;
  synthetic: boolean;
  observedAt: string | null;
  totalPower: number | null;
  memberCount: number | null;
  capacity: number | null;
  growth24h: number | null;
  growth7d: number | null;
  growth7dPct: number | null;
  joined: string[];
  left: string[];
  topGrowth: { name: string; pct: number }[];
  honor7d: number | null;
  tech7d: number | null;
  standings: { tag: string; position: number; change: number | null; isHome: boolean }[];
  renames: string[];
  reviewNames: string[];
  openReviews: number;
  absencesEnding: string[];
  syncFailures: number;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const signed = (value: number | null) => value === null ? "n/a" : `${value >= 0 ? "+" : "−"}${compact.format(Math.abs(value))}`;

export function periodKey(kind: ReportKind, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  if (kind !== "weekly") return `${kind}:${day}`;
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86_400_000 + start.getUTCDay() + 1) / 7);
  return `weekly:${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function buildReport(input: ReportInput): { audience: Audience; title: string; lines: string[]; url: string } {
  const audience = REPORT_AUDIENCE[input.kind];
  const lines: string[] = [];
  if (input.synthetic) lines.push("⚠ SYNTHETIC TEST DATA — not real alliance statistics.");
  const stamp = input.observedAt ? `Data as of ${input.observedAt.slice(0, 16).replace("T", " ")} UTC` : "No verified data yet";
  let title: string;
  let path = "/intel";
  switch (input.kind) {
    case "daily":
      title = `[${input.tag}] Daily alliance summary`;
      lines.push(`Total power ${input.totalPower === null ? "n/a" : compact.format(input.totalPower)} (${signed(input.growth24h)} in 24h)`);
      if (input.memberCount !== null) lines.push(`Members ${input.memberCount}${input.capacity ? ` / ${input.capacity}` : ""}`);
      if (input.joined.length) lines.push(`Joined: ${input.joined.join(", ")}`);
      if (input.left.length) lines.push(`Left: ${input.left.join(", ")}`);
      break;
    case "weekly":
      title = `[${input.tag}] Weekly performance`;
      lines.push(`Power ${signed(input.growth7d)} this week${input.growth7dPct === null ? "" : ` (${input.growth7dPct.toFixed(1)}%)`}`);
      if (input.topGrowth.length) lines.push(`Fastest growth by percentage: ${input.topGrowth.map((row) => `${row.name} +${row.pct.toFixed(1)}%`).join(" · ")}`);
      if (input.honor7d !== null) lines.push(`Honor earned ${compact.format(input.honor7d)} · Tech donated ${compact.format(input.tech7d ?? 0)}`);
      lines.push(`Membership: ${input.joined.length} joined, ${input.left.length} left`);
      break;
    case "kingdom":
      title = "Kingdom standings (tracked alliances)";
      path = "/intel/kingdom";
      lines.push("Order among alliances BurnFire tracks — not the official kingdom ranking.");
      for (const row of input.standings.slice(0, 10)) {
        const move = row.change === null || row.change === 0 ? "" : row.change > 0 ? ` ▲${row.change}` : ` ▼${-row.change}`;
        lines.push(`${row.position}. [${row.tag}]${row.isHome ? " ★" : ""}${move}`);
      }
      if (input.renames.length) lines.push(`Renamed: ${input.renames.join("; ")}`);
      break;
    case "leadership":
      title = `[${input.tag}] Leadership review digest`;
      path = "/intel/leadership";
      lines.push(`${input.reviewNames.length} member(s) flagged for review · ${input.openReviews} open review(s)`);
      if (input.reviewNames.length) lines.push(`Needs a look: ${input.reviewNames.slice(0, 15).join(", ")}`);
      lines.push("Flags are prompts, not verdicts. No action is taken automatically.");
      if (input.absencesEnding.length) lines.push(`Absences ending soon: ${input.absencesEnding.join(", ")}`);
      if (input.syncFailures) lines.push(`Data sync failures in the last 24h: ${input.syncFailures}`);
      break;
  }
  lines.push(stamp);
  return { audience, title, lines, url: `${input.siteUrl.replace(/\/$/, "")}${path}` };
}
