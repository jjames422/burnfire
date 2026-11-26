import { NextResponse, type NextRequest } from "next/server";
import { query, queryOne } from "@/lib/server/db";
import { activeProviderId, homeAlliance, type IntelAccess } from "@/lib/server/intel";
import { kingdomStandings, loadAllianceDashboard } from "@/lib/server/intel-queries";
import { buildReport, periodKey, type ReportKind } from "@/lib/intel/reports.ts";
import { secretMatches } from "@/lib/intel/secret.ts";
import { jsonError } from "@/lib/server/http";

const KINDS: ReportKind[] = ["daily", "weekly", "kingdom", "leadership"];

/**
 * Machine endpoint for the alliance's existing community bot. The bot asks
 * for one report, posts it to the channel configured for that audience, and
 * passes claim=1 so each period is posted at most once.
 */
export async function GET(request: NextRequest) {
  if (!process.env.INTEL_REPORT_SECRET) return jsonError("Reports are not configured.", 503);
  if (!secretMatches(request.headers.get("authorization"), process.env.INTEL_REPORT_SECRET)) return jsonError("Unauthorized.", 401);
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind") as ReportKind;
  const tenant = params.get("tenant") ?? "burnfire";
  if (!KINDS.includes(kind) || !/^[a-z0-9-]{2,40}$/.test(tenant)) return jsonError("Unknown report.", 404);
  const home = await homeAlliance(tenant);
  if (!home) return jsonError("This alliance has no data provider connected.", 404);

  const key = periodKey(kind, new Date());
  if (params.get("claim") === "1") {
    const claimed = await query(`insert into intel_report_deliveries (tenant, kind, period_key) values ($1, $2, $3)
      on conflict do nothing returning id`, [tenant, kind, key]);
    if (!claimed.length) return jsonError("This report was already delivered for the period.", 409);
  }

  // Reports are built with a leadership-level view of the tenant's own data;
  // what reaches each audience is decided by buildReport.
  const leadership: IntelAccess = { tenant, allianceName: null, kingdom: home.kingdom, member: true, leadership: true,
    platformAdmin: false, gameRank: null, inGameName: null, linkedPlayerId: null };
  const dashboard = await loadAllianceDashboard(tenant, leadership, "");
  if (!dashboard.configured) return jsonError("No data yet.", 404);
  const days = kind === "weekly" ? 7 : 1;
  const since = Date.now() - days * 86_400_000;
  const growth = (key: "24h" | "7d") => {
    const value = dashboard.summary?.growth[key];
    return value && value.available ? value : null;
  };
  const standings = kind === "kingdom" ? await kingdomStandings(home.kingdom) : [];
  const failures = await queryOne<{ count: number }>(
    `select count(*)::int as count from intel_sync_runs where provider = $1 and status = 'failed' and started_at > now() - interval '1 day'`,
    [activeProviderId()]);
  const report = buildReport({
    kind,
    siteUrl: process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://portal.burnfire2.com",
    tag: home.tag,
    synthetic: dashboard.freshness.synthetic,
    observedAt: dashboard.freshness.last_observed_at ? new Date(dashboard.freshness.last_observed_at).toISOString() : null,
    totalPower: dashboard.summary?.total_power ?? null,
    memberCount: dashboard.summary?.member_count ?? null,
    capacity: dashboard.summary?.capacity ?? null,
    growth24h: growth("24h")?.delta ?? null,
    growth7d: growth("7d")?.delta ?? null,
    growth7dPct: growth("7d")?.percent ?? null,
    joined: dashboard.changes.filter((row) => row.kind === "joined" && new Date(row.at).getTime() > since).map((row) => row.name),
    left: dashboard.changes.filter((row) => row.kind === "left" && new Date(row.at).getTime() > since).map((row) => row.name),
    topGrowth: dashboard.roster.filter((row) => row.growth_7d_pct !== null && row.growth_7d_pct > 0)
      .sort((a, b) => b.growth_7d_pct! - a.growth_7d_pct!).slice(0, 5).map((row) => ({ name: row.name, pct: row.growth_7d_pct! })),
    honor7d: dashboard.summary?.honor_7d ?? null,
    tech7d: dashboard.summary?.tech_7d ?? null,
    standings: standings.filter((row) => row.position !== null).map((row) => ({ tag: row.tag, position: row.position!, change: row.position_change_7d, isHome: row.is_home })),
    renames: [],
    reviewNames: dashboard.roster.filter((row) => row.activity && ["needs_review", "likely_inactive"].includes(row.activity.state)).map((row) => row.name),
    openReviews: dashboard.roster.filter((row) => row.review_id).length,
    absencesEnding: [],
    syncFailures: failures?.count ?? 0,
  });
  return NextResponse.json({ kind, period: key, ...report }, { headers: { "Cache-Control": "no-store" } });
}
