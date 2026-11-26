import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { query } from "@/lib/server/db";
import { activeProviderId, apiKeyConfigured, audit, fixturesEnabled, requireIntel, syncDeps, UUID } from "@/lib/server/intel";
import { providerBudget, syncNow } from "@/lib/intel/sync.ts";
import { jsonError } from "@/lib/server/http";

export async function GET() {
  const gate = await requireIntel("platform");
  if (gate.response) return gate.response;
  const provider = activeProviderId();
  const [providerRows, today, daily, alliances, runs, storage, auditRows, settings] = await Promise.all([
    query(`select id, name, base_url, enabled, daily_request_limit, reserve_requests, quota_limit, quota_remaining, quota_resets,
             quota_observed_at, auth_status, auth_checked_at, response_shape, response_shape_at from intel_providers order by id`),
    query(`select count(*) filter (where status = 'success')::int as success, count(*) filter (where status = 'unchanged')::int as unchanged,
             count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status = 'skipped')::int as skipped,
             coalesce(sum(requests_used), 0)::int as requests
           from intel_sync_runs where provider = $1 and started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'`, [provider]),
    query(`select to_char(date_trunc('day', started_at at time zone 'UTC'), 'YYYY-MM-DD') as day, coalesce(sum(requests_used), 0)::int as requests,
             count(*) filter (where status = 'failed')::int as failed
           from intel_sync_runs where provider = $1 and started_at > now() - interval '30 days' group by 1 order by 1`, [provider]),
    query(`select a.id, a.kingdom, a.tag, a.name, a.tenant is not null as is_home, a.tracked, a.sync_interval_minutes, a.next_sync_at,
             a.last_success_at, a.last_observed_at, a.consecutive_failures, a.last_error,
             (select count(*)::int from intel_alliance_snapshots s where s.alliance_id = a.id) as snapshots
           from intel_alliances a where a.provider = $1 order by a.tenant is null, a.tracked desc, a.tag`, [provider]),
    query(`select r.id, r.trigger, r.status, r.started_at, r.finished_at, r.attempts, r.requests_used, r.http_status, r.error_code,
             r.error_message, r.provider_cached, r.provider_age_seconds, r.quota_remaining, r.members_seen, a.tag
           from intel_sync_runs r left join intel_alliances a on a.id = r.alliance_id
           where r.provider = $1 order by r.started_at desc limit 60`, [provider]),
    query(`select c.relname as table, pg_total_relation_size(c.oid)::bigint as bytes, coalesce(s.n_live_tup, 0)::bigint as rows
           from pg_class c left join pg_stat_user_tables s on s.relid = c.oid
           where c.relkind = 'r' and c.relname like 'intel\\_%' and c.relnamespace = to_regnamespace(current_schema())
           order by 2 desc`),
    query(`select l.action, l.target, l.detail, l.created_at, (select in_game_name from profiles where id = l.actor) as actor_name
           from intel_audit_log l where l.tenant is null or l.action like 'integration.%' order by l.created_at desc limit 50`),
    gate.tenant ? query(`select inactivity_days, member_hourly_days, member_retention_days, departed_retention_days, kingdom_public, retention_ran_at
           from intel_settings where tenant = $1`, [gate.tenant]) : Promise.resolve([]),
  ]);
  const budget = await providerBudget(syncDeps().pool, provider);
  const nextRun = alliances.filter((row) => row.tracked).map((row) => row.next_sync_at as string).sort()[0] ?? null;
  return NextResponse.json({
    provider, synthetic: provider === "fixture", fixtures_enabled: fixturesEnabled(), viewer_leadership: gate.access.leadership,
    key_configured: apiKeyConfigured(), scheduler_configured: Boolean(process.env.INTEL_CRON_SECRET),
    reports_configured: Boolean(process.env.INTEL_REPORT_SECRET),
    providers: providerRows, today: today[0], daily, budget, next_run: nextRun, alliances, runs, storage, audit: auditRows,
    settings: settings[0] ?? null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync_now"), alliance_id: z.string().regex(UUID) }),
  z.object({ action: z.literal("set_interval"), alliance_id: z.string().regex(UUID), minutes: z.number().int().min(30).max(10080) }),
  z.object({ action: z.literal("set_provider"), enabled: z.boolean(), reserve_requests: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal("set_retention"), member_hourly_days: z.number().int().min(1).max(90),
    member_retention_days: z.number().int().min(30).max(1095), departed_retention_days: z.number().int().min(0).max(365),
    inactivity_days: z.number().int().min(2).max(60) }),
]);

export async function POST(request: NextRequest) {
  const gate = await requireIntel("platform");
  if (gate.response) return gate.response;
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the values and try again.");
  const input = parsed.data;
  const actor = gate.user.id;
  switch (input.action) {
    case "sync_now": {
      const outcome = await syncNow(syncDeps(), input.alliance_id, actor);
      await audit(null, actor, "integration.sync_now", `alliance:${input.alliance_id}`, { status: outcome.status });
      return NextResponse.json(outcome);
    }
    case "set_interval": {
      await query(`update intel_alliances set sync_interval_minutes = $2,
          next_sync_at = least(next_sync_at, now() + make_interval(mins => $2)) where id = $1`, [input.alliance_id, input.minutes]);
      await audit(null, actor, "integration.interval", `alliance:${input.alliance_id}`, { minutes: input.minutes });
      return NextResponse.json({ ok: true });
    }
    case "set_provider": {
      await query(`update intel_providers set enabled = $2, reserve_requests = $3 where id = $1`, [activeProviderId(), input.enabled, input.reserve_requests]);
      await audit(null, actor, "integration.provider", `provider:${activeProviderId()}`, { enabled: input.enabled, reserve: input.reserve_requests });
      return NextResponse.json({ ok: true });
    }
    case "set_retention": {
      if (!gate.tenant) return jsonError("Retention settings belong to an alliance. Join one first.", 409);
      const { action: _ignored, ...values } = input;
      await query(`update intel_settings set member_hourly_days = $2, member_retention_days = $3, departed_retention_days = $4,
          inactivity_days = $5, updated_by = $6, updated_at = now() where tenant = $1`,
        [gate.tenant, values.member_hourly_days, values.member_retention_days, values.departed_retention_days, values.inactivity_days, actor]);
      await audit(gate.tenant, actor, "integration.retention", `tenant:${gate.tenant}`, values);
      return NextResponse.json({ ok: true });
    }
  }
}
