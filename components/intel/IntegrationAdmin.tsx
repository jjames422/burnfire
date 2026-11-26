"use client";

import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api, apiPost } from "@/lib/api/client";
import { dateTime, day, full, relative } from "@/lib/intel/format";
import { IntelHeader, IntelNav, Loading, SyntheticBanner } from "./IntelChrome";

type Admin = {
  provider: string; synthetic: boolean; fixtures_enabled: boolean; viewer_leadership: boolean; key_configured: boolean; scheduler_configured: boolean; reports_configured: boolean;
  providers: { id: string; name: string; base_url: string; enabled: boolean; daily_request_limit: number; reserve_requests: number; quota_limit: number | null;
    quota_remaining: number | null; quota_resets: string | null; quota_observed_at: string | null; auth_status: string | null; auth_checked_at: string | null;
    response_shape: string[] | null; response_shape_at: string | null }[];
  today: { success: number; unchanged: number; failed: number; skipped: number; requests: number };
  daily: { day: string; requests: number; failed: number }[];
  budget: { remaining: number; limit: number; reserve: number; usedToday: number; known: boolean };
  next_run: string | null;
  alliances: { id: string; kingdom: number; tag: string; name: string; is_home: boolean; tracked: boolean; sync_interval_minutes: number; next_sync_at: string;
    last_success_at: string | null; last_observed_at: string | null; consecutive_failures: number; last_error: string | null; snapshots: number }[];
  runs: { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; attempts: number; requests_used: number; http_status: number | null;
    error_code: string | null; error_message: string | null; provider_cached: boolean | null; provider_age_seconds: number | null; quota_remaining: number | null; members_seen: number | null; tag: string | null }[];
  storage: { table: string; bytes: string; rows: string }[];
  audit: { action: string; target: string | null; detail: Record<string, unknown>; created_at: string; actor_name: string | null }[];
  settings: { inactivity_days: number; member_hourly_days: number; member_retention_days: number; departed_retention_days: number; kingdom_public: boolean; retention_ran_at: string | null } | null;
};

const INTERVALS = [30, 60, 120, 360, 720, 1440];

export function IntegrationAdmin() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Admin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api<Admin>("/api/intel/admin");
    if (result.error || !result.data) return setError(result.error ?? "Integration status could not be loaded.");
    setData(result.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const result = await apiPost<{ status?: string; code?: string; reason?: string }>("/api/intel/admin", body);
    setBusy(false);
    if (result.error) return setMessage(t(result.error));
    const status = result.data?.status;
    setMessage(status === "failed" ? t("Synchronization failed: {code}", { code: result.data?.code ?? "?" })
      : status === "recent" ? t("Synced less than five minutes ago, so the existing result was reused without spending quota.")
      : status === "skipped" ? t("Skipped: {reason}", { reason: result.data?.reason ?? "?" }) : success);
    await load();
  }

  if (!data) return <Loading error={error} />;
  const provider = data.providers.find((row) => row.id === data.provider);
  const totalBytes = data.storage.reduce((sum, row) => sum + Number(row.bytes), 0);
  const maxDaily = Math.max(1, ...data.daily.map((row) => row.requests));
  const plannedPerDay = data.alliances.filter((row) => row.tracked).reduce((sum, row) => sum + 1440 / row.sync_interval_minutes, 0);
  const authLabel = !data.key_configured ? t("No key configured") : provider?.auth_status === "ok" ? t("Accepted") : provider?.auth_status === "rejected" ? t("Rejected by provider") : t("Not yet checked");

  async function saveRetention(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await act({ action: "set_retention", ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)])) }, t("Retention settings saved."));
  }

  return (
    <>
      <IntelHeader kicker={<Text>{"PLATFORM ADMINISTRATION"}</Text>} title={<Text>{"Integration health"}</Text>} nav={<IntelNav leadership={data.viewer_leadership} platform />}>
        <p className="intel-note" style={{ maxWidth: 360 }}><Text>{"Technical settings only. Platform administration does not open any alliance's private leadership records."}</Text></p>
      </IntelHeader>
      {data.synthetic && <SyntheticBanner />}
      {message && <p className="intel-message" role="status">{message}</p>}
      {!data.key_configured && !data.synthetic && (
        <p className="intel-warning intel-panel" role="alert" style={{ marginBottom: 24 }}>
          <Text>{"No tracker API key is configured. Create a key at api.lastasylumtracker.com (Patreon login) and store it as the LAT_API_KEY server environment variable. Keys are never entered or shown in the browser."}</Text>
        </p>
      )}

      <div className="intel-kpis">
        <div className="intel-kpi">
          <span><Text>{"Provider"}</Text></span>
          <strong style={{ fontSize: 26 }}>{provider?.name ?? data.provider}</strong>
          <small>{provider?.enabled ? t("Enabled") : t("Disabled")} · <Text values={{ status: authLabel }}>{"Key: {status}"}</Text></small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Quota remaining"}</Text></span>
          <strong className="intel-num">{full(data.budget.remaining, locale)}</strong>
          <small>{data.budget.known ? <Text values={{ limit: full(data.budget.limit, locale), time: relative(provider?.quota_observed_at, locale) }}>{"of {limit}, reported by provider {time}"}</Text> : <Text values={{ limit: full(data.budget.limit, locale) }}>{"of {limit}, estimated from local count"}</Text>}</small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Requests today"}</Text></span>
          <strong className="intel-num">{data.today.requests}</strong>
          <small><Text values={{ planned: Math.round(plannedPerDay) }}>{"About {planned} per day scheduled"}</Text></small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Syncs today"}</Text></span>
          <strong className="intel-num">{data.today.success + data.today.unchanged}<small style={{ display: "inline", fontSize: 13 }}> / {data.today.failed} <Text>{"failed"}</Text></small></strong>
          <small><Text values={{ count: data.today.unchanged }}>{"{count} returned an already-recorded copy"}</Text></small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Next scheduled"}</Text></span>
          <strong className="intel-num" style={{ fontSize: 18 }}>{relative(data.next_run, locale)}</strong>
          <small>{data.scheduler_configured ? <Text>{"Scheduler secret configured"}</Text> : <Text>{"Scheduler secret missing; automatic sync is off"}</Text>}</small>
        </div>
      </div>

      <div className="intel-split">
        <div>
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Data freshness"}</Text></h2><p><Text>{"Each tracked alliance with its interval. The home alliance asks the provider for a live read; others reuse the provider's cache."}</Text></p></div></div>
            <div className="intel-table-wrap">
              <table className="intel-table">
                <thead><tr>
                  <th scope="col"><Text>{"Alliance"}</Text></th>
                  <th scope="col" className="intel-hide-mobile"><Text>{"Game data"}</Text></th>
                  <th scope="col"><Text>{"Interval"}</Text></th>
                  <th scope="col" className="intel-hide-mobile intel-hide-tablet"><Text>{"Next"}</Text></th>
                  <th scope="col"><span className="intel-sr"><Text>{"Sync now"}</Text></span></th>
                </tr></thead>
                <tbody>{data.alliances.map((row) => (
                  <tr key={row.id} className={row.is_home ? "is-home" : undefined}>
                    <td><div className="intel-member"><div>[{row.tag}] {row.name}{!row.tracked && <> <span className="intel-chip"><Text>{"PAUSED"}</Text></span></>}
                      <small>{row.consecutive_failures ? t("{count} failures · {error}", { count: row.consecutive_failures, error: row.last_error ?? "" }) : t("{count} snapshots stored", { count: row.snapshots })}</small></div></div></td>
                    <td className="intel-hide-mobile">{relative(row.last_observed_at, locale)}</td>
                    <td>
                      <select value={row.sync_interval_minutes} disabled={busy} aria-label={t("Interval for {tag}", { tag: row.tag })}
                        onChange={(event) => void act({ action: "set_interval", alliance_id: row.id, minutes: Number(event.target.value) }, t("Interval saved."))}>
                        {[...new Set([...INTERVALS, row.sync_interval_minutes])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? t("{count} min", { count: minutes }) : t("{count} h", { count: minutes / 60 })}</option>)}
                      </select>
                    </td>
                    <td className="intel-hide-mobile intel-hide-tablet">{relative(row.next_sync_at, locale)}</td>
                    <td><button type="button" className="intel-button" disabled={busy} onClick={() => void act({ action: "sync_now", alliance_id: row.id }, t("Synchronized."))}><Text>{"Sync now"}</Text></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Recent synchronizations"}</Text></h2><p><Text>{"Error text is stored with keys and tokens removed."}</Text></p></div></div>
            <div className="intel-table-wrap intel-scroll" style={{ maxHeight: 420 }}>
              <table className="intel-table">
                <thead><tr>
                  <th scope="col"><Text>{"Started"}</Text></th><th scope="col"><Text>{"Alliance"}</Text></th><th scope="col"><Text>{"Result"}</Text></th>
                  <th scope="col" className="intel-hide-mobile"><Text>{"Requests"}</Text></th><th scope="col" className="intel-hide-mobile intel-hide-tablet"><Text>{"Copy age"}</Text></th>
                </tr></thead>
                <tbody>{data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>{dateTime(run.started_at, locale)}<small style={{ display: "block", color: "var(--intel-ink-3)" }}>{run.trigger === "manual" ? t("Manual") : t("Scheduled")}</small></td>
                    <td>{run.tag ? `[${run.tag}]` : "—"}</td>
                    <td style={{ whiteSpace: "normal" }}>
                      <span className={`intel-status is-${run.status === "failed" ? "critical" : run.status === "skipped" ? "warning" : run.status === "running" ? "neutral" : "good"}`}>
                        <span aria-hidden="true">{run.status === "failed" ? "!" : run.status === "skipped" ? "–" : run.status === "running" ? "…" : "✓"}</span>
                        {{ success: t("New data"), unchanged: t("Already recorded"), failed: t("Failed"), skipped: t("Skipped"), running: t("Running") }[run.status] ?? run.status}
                      </span>
                      {run.error_code && <small style={{ display: "block", color: "var(--intel-ink-3)" }}>{run.error_code}{run.http_status ? ` · HTTP ${run.http_status}` : ""}{run.error_message ? ` · ${run.error_message}` : ""}</small>}
                    </td>
                    <td className="intel-hide-mobile">{run.requests_used}</td>
                    <td className="intel-hide-mobile intel-hide-tablet">{run.provider_age_seconds === null ? "—" : t("{count} min", { count: Math.round(run.provider_age_seconds / 60) })}</td>
                  </tr>
                ))}</tbody>
              </table>
              {data.runs.length === 0 && <p className="intel-empty"><Text>{"No synchronizations have run yet."}</Text></p>}
            </div>
          </section>
        </div>
        <aside className="intel-aside">
          <section>
            <h2><Text>{"Requests per day · 30 days"}</Text></h2>
            {data.daily.length === 0 ? <p className="intel-note"><Text>{"No requests recorded yet."}</Text></p> : (
              <div className="intel-columns" role="list" aria-label={t("Requests per day")}>
                {data.daily.map((row) => <div key={row.day} role="listitem" title={`${day(row.day, locale)}: ${row.requests}`} aria-label={`${day(row.day, locale)}: ${row.requests}`}><i style={{ height: `${Math.max(2, (row.requests / maxDaily) * 100)}%` }} /></div>)}
              </div>
            )}
            <p className="intel-note"><Text values={{ limit: full(data.budget.limit, locale), reserve: data.budget.reserve }}>{"Daily limit {limit}. Other alliances stop syncing when fewer than {reserve} requests remain, keeping the reserve for the home alliance."}</Text></p>
          </section>
          <section>
            <h2><Text>{"Operating cost"}</Text></h2>
            <p className="intel-num" style={{ fontSize: 20 }}><Text>{"Estimated $0.00 per month"}</Text></p>
            <p className="intel-note"><Text>{"Estimate, not billing data. The free tracker tier covers current usage, and synchronization runs on existing hosting. No billing account is connected, so actual charges are not shown."}</Text></p>
          </section>
          <section>
            <h2><Text>{"Storage"}</Text></h2>
            <p className="intel-num" style={{ fontSize: 13, marginBottom: 10 }}><Text values={{ size: `${(totalBytes / 1_048_576).toFixed(1)} MB` }}>{"{size} across intelligence tables"}</Text></p>
            <ul className="intel-feed">{data.storage.slice(0, 6).map((row) => (
              <li key={row.table}><span aria-hidden="true">▪</span><span>{row.table}<small>{t("{count} rows", { count: full(Number(row.rows), locale) })}</small></span><time>{`${(Number(row.bytes) / 1024).toFixed(0)} KB`}</time></li>
            ))}</ul>
          </section>
          {data.settings && (
            <section>
              <h2><Text>{"Retention"}</Text></h2>
              <form className="intel-form" onSubmit={saveRetention}>
                <label><Text>{"Keep hourly member detail (days)"}</Text><input type="number" name="member_hourly_days" min={1} max={90} defaultValue={data.settings.member_hourly_days} /></label>
                <label><Text>{"Keep daily member history (days)"}</Text><input type="number" name="member_retention_days" min={30} max={1095} defaultValue={data.settings.member_retention_days} /></label>
                <label><Text>{"Delete a departed member's history after (days)"}</Text><input type="number" name="departed_retention_days" min={0} max={365} defaultValue={data.settings.departed_retention_days} /></label>
                <label><Text>{"Inactivity policy (days)"}</Text><input type="number" name="inactivity_days" min={2} max={60} defaultValue={data.settings.inactivity_days} /></label>
                <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Save retention"}</Text></button></div>
              </form>
              <p className="intel-note" style={{ marginTop: 10 }}><Text values={{ time: relative(data.settings.retention_ran_at, locale) }}>{"Alliance totals are kept indefinitely, thinned to one per day after 30 days. Last retention pass: {time}."}</Text></p>
            </section>
          )}
          <section>
            <h2><Text>{"Provider response fields"}</Text></h2>
            <p className="intel-note" style={{ marginBottom: 10 }}><Text>{"Field names from the latest live answer, recorded without values, so the parser can be checked against what the provider really sends."}</Text></p>
            {provider?.response_shape?.length ? <p className="intel-note" style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-word" }}>{provider.response_shape.join(" · ")}</p> : <p className="intel-note"><Text>{"No live response received yet."}</Text></p>}
          </section>
          <section>
            <h2><Text>{"Provider settings"}</Text></h2>
            <label className="portal-regent-select">
              <input type="checkbox" checked={provider?.enabled ?? false} disabled={busy} onChange={(event) => void act({ action: "set_provider", enabled: event.target.checked, reserve_requests: provider?.reserve_requests ?? 100 }, t("Provider settings saved."))} />
              <Text>{"Synchronization enabled"}</Text>
            </label>
          </section>
          <section>
            <h2><Text>{"Audit history"}</Text></h2>
            {data.audit.length === 0 ? <p className="intel-note"><Text>{"No integration changes recorded yet."}</Text></p> : (
              <ul className="intel-feed">{data.audit.slice(0, 12).map((row, index) => (
                <li key={index}><span aria-hidden="true">•</span><span>{row.action}<small>{row.actor_name ?? "—"}{row.target ? ` · ${row.target.split(":")[0]}` : ""}</small></span><time>{relative(row.created_at, locale)}</time></li>
              ))}</ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
