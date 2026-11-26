"use client";

import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api } from "@/lib/api/client";
import { compact, day as dayLabel, full, percent, relative, signed } from "@/lib/intel/format";
import { Delta, Freshness, IntelHeader, IntelNav, Loading, SERIES_COLORS, SyntheticBanner } from "./IntelChrome";
import { LineChart } from "./LineChart";
import { dateOfDay, progression, serverDay, type Milestone } from "@/lib/intel/progression";

type Standing = {
  id: string; tag: string; name: string; is_home: boolean; level: number | null; total_power: number | null; member_count: number | null;
  average_power: number | null; members_with_power: number | null; growth_24h: number | null; growth_7d: number | null; growth_30d: number | null;
  growth_24h_pct: number | null; growth_7d_pct: number | null; growth_30d_pct: number | null; member_change_7d: number | null;
  position: number | null; position_change_7d: number | null; last_success_at: string | null; last_observed_at: string | null; failing: boolean;
};
type Kingdom = {
  kingdom: { number: number; name: string | null; opened_on: string | null; season: string | null; notes: string | null; updated_at: string | null; king_name: string | null; ruling_alliance: string | null };
  milestones: Milestone[];
  synthetic: boolean; last_success_at: string | null; standings: Standing[];
  comparison: { id: string; points: { t: number; total: number | null; members: number; average: number | null }[]; coverage_start: number | null; gap_days: number }[];
  events: { id: string; occurred_at: string; kind: string; title: string; body: string | null; source: string; verification: string; visibility: string; alliance_tag: string | null }[];
  relations: Record<string, string>;
  viewer: { leadership: boolean; member: boolean };
};
type Metric = "total" | "members" | "average";
type SortKey = "position" | "tag" | "total_power" | "member_count" | "average_power" | "growth_24h" | "growth_7d_pct" | "growth_30d_pct";

function Source({ kind }: { kind: "synced" | "manual" | "missing" }) {
  return (
    <span className="intel-source">
      {kind === "synced" && <span className="is-synced"><Text>{"Synced"}</Text></span>}
      {kind === "manual" && <span className="is-manual"><Text>{"Leadership record"}</Text></span>}
      {kind === "missing" && <span className="is-missing"><Text>{"Not available"}</Text></span>}
    </span>
  );
}

export function KingdomIntel() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Kingdom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<string, number>>({});
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>("total");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "position", direction: 1 });
  const [page, setPage] = useState(0);
  const [platform, setPlatform] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (compare: string[], period: number) => {
    const result = await api<Kingdom>(`/api/intel/kingdom?compare=${compare.join(",")}&days=${period}`);
    if (result.error || !result.data) return setError(result.error ?? "Kingdom intelligence could not be loaded.");
    setData(result.data);
    return result.data;
  }, []);

  useEffect(() => {
    void (async () => {
      const first = await load([], 30);
      if (!first) return;
      const initial = first.standings.filter((row) => row.position !== null).slice(0, 3);
      const home = first.standings.find((row) => row.is_home);
      const chosen = [...new Set([home?.id, ...initial.map((row) => row.id)].filter((id): id is string => Boolean(id)))].slice(0, 3);
      setSlots(Object.fromEntries(chosen.map((id, index) => [id, index])));
    })();
    void api<{ viewer?: { platform: boolean } }>("/api/intel/alliance").then((result) => setPlatform(Boolean(result.data?.viewer?.platform)));
  }, [load]);

  const compareIds = useMemo(() => Object.keys(slots).sort((a, b) => slots[a] - slots[b]), [slots]);
  useEffect(() => { if (compareIds.length) void load(compareIds, days); }, [compareIds, days, load]);

  // Color follows the alliance: a slot is kept until that alliance is removed.
  function toggle(id: string) {
    setSlots((current) => {
      if (id in current) { const next = { ...current }; delete next[id]; return next; }
      const used = new Set(Object.values(current));
      const free = SERIES_COLORS.findIndex((_, index) => !used.has(index));
      if (free < 0) { setMessage(t("Compare up to six alliances at once.")); return current; }
      return { ...current, [id]: free };
    });
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.standings
      .filter((row) => !needle || row.tag.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const left = sort.key === "tag" ? a.tag.toLowerCase() : (a[sort.key] ?? (sort.direction === 1 ? Infinity : -Infinity));
        const right = sort.key === "tag" ? b.tag.toLowerCase() : (b[sort.key] ?? (sort.direction === 1 ? Infinity : -Infinity));
        return (left < right ? -1 : left > right ? 1 : 0) * sort.direction;
      });
  }, [data, search, sort]);

  if (!data) return <Loading error={error} />;
  const tracked = data.standings.filter((row) => row.position !== null).length;
  const opened = data.kingdom.opened_on ? new Date(`${data.kingdom.opened_on}T00:00:00Z`) : null;
  const day = data.kingdom.opened_on ? serverDay(data.kingdom.opened_on) : null;
  const state = day !== null ? progression(day, data.milestones) : null;
  const day_ = (value: number | string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value));
  const pageSize = 25;
  const visible = rows.slice(page * pageSize, (page + 1) * pageSize);
  const byId = new Map(data.standings.map((row) => [row.id, row]));
  const metricLabel = { total: t("Total power"), members: t("Members"), average: t("Average power") }[metric];
  const stanceLabels: Record<string, string> = { allied: t("Allied"), nap: t("NAP"), neutral: t("Neutral"), watch: t("Watch"), rival: t("Rival"), hostile: t("Hostile") };
  const kindLabels: Record<string, string> = { throne: t("Throne"), merger: t("Merger"), disband: t("Disbanded"), ranking: t("Ranking"), kvk: t("KvK"), season: t("Season"), diplomacy: t("Diplomacy"), rename: t("Renamed"), other: t("Other") };

  const header = (key: SortKey, label: string, className = "") => (
    <th scope="col" className={className} aria-sort={sort.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : key === "position" || key === "tag" ? 1 : -1 }))}>
        {label}{sort.key === key && <span aria-hidden="true">{sort.direction === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  async function send(path: string, method: string, body: unknown, success: string) {
    setBusy(true);
    const result = await api(path, { method, body: JSON.stringify(body) });
    setBusy(false);
    if (result.error) { setMessage(t(result.error)); return false; }
    setMessage(success);
    await load(compareIds, days);
    return true;
  }

  async function track(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const tag = String(new FormData(form).get("tag") ?? "");
    if (await send("/api/intel/kingdom/alliances", "POST", { tag }, t("Alliance added. Its history starts today."))) form.reset();
  }
  async function saveFacts(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string) => String(values.get(key) ?? "").trim() || null;
    if (await send("/api/intel/kingdom", "PATCH", { name: text("name"), opened_on: text("opened_on"), season: text("season"), notes: text("notes"), king_name: text("king_name"), ruling_alliance: text("ruling_alliance") }, t("Kingdom details saved."))) setEditing(false);
  }
  async function addMilestone(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const ok = await send("/api/intel/kingdom/milestones", "POST", {
      title: values.title, kind: values.kind, certainty: values.certainty, notes: values.notes || null,
      start_day: Number(values.start_day), end_day: values.end_day ? Number(values.end_day) : null,
    }, t("Milestone saved."));
    if (ok) form.reset();
  }
  async function addRecord(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (await send("/api/intel/kingdom/events", "POST", { ...values, alliance_id: values.alliance_id || null }, t("Record added."))) form.reset();
  }

  return (
    <>
      <IntelHeader
        kicker={<Text>{"KINGDOM INTELLIGENCE"}</Text>}
        title={<><Text values={{ number: data.kingdom.number }}>{"Kingdom #{number}"}</Text>{data.kingdom.name && <small>{data.kingdom.name}</small>}</>}
        nav={<IntelNav leadership={data.viewer.leadership} platform={platform} />}
      >
        <Freshness synthetic={data.synthetic} lastSuccess={data.last_success_at} observed={data.standings.reduce<string | null>((max, row) => row.last_observed_at && (!max || row.last_observed_at > max) ? row.last_observed_at : max, null)} stale={false} failing={data.standings.some((row) => row.failing)} />
      </IntelHeader>
      {data.synthetic && <SyntheticBanner />}
      {message && <p className="intel-message" role="status">{message}</p>}

      <dl className="intel-facts">
        <div><dt><Text>{"Server day"}</Text></dt><dd>{day !== null ? t("Day {day}", { day }) : "—"}</dd>
          {opened ? <><Source kind="manual" /><small className="intel-note" style={{ display: "block", marginTop: 6 }}><Text values={{ date: day_(opened.getTime()) }}>{"Opened {date}"}</Text></small></> : <Source kind="missing" />}</div>
        <div><dt><Text>{"King"}</Text></dt><dd>{data.kingdom.king_name ?? "—"}{data.kingdom.ruling_alliance && <small className="intel-note" style={{ marginInlineStart: 8 }}>[{data.kingdom.ruling_alliance}]</small>}</dd>{data.kingdom.king_name ? <Source kind="manual" /> : <Source kind="missing" />}</div>
        <div><dt><Text>{"Now"}</Text></dt><dd>{state?.current.length ? state.current.map((m) => m.title).join(" · ") : t("Between milestones")}</dd>
          {state?.upcoming[0] && <small className="intel-note"><Text values={{ title: state.upcoming[0].title, days: state.upcoming[0].in_days }}>{"Next: {title} in {days} days"}</Text></small>}</div>
        <div><dt><Text>{"Season"}</Text></dt><dd>{data.kingdom.season ?? (state?.current.find((m) => m.kind === "season")?.title ?? t("Pre-season"))}</dd>{data.kingdom.season ? <Source kind="manual" /> : null}</div>
      </dl>
      {data.viewer.leadership && (
        <div style={{ marginTop: -18, marginBottom: 30 }}>
          {!editing ? <button type="button" className="intel-button" onClick={() => setEditing(true)}><Text>{"Edit kingdom details"}</Text></button> : (
            <form className="intel-form intel-panel" onSubmit={saveFacts}>
              <div className="intel-form-row">
                <label><Text>{"Kingdom name"}</Text><input name="name" maxLength={80} defaultValue={data.kingdom.name ?? ""} /></label>
                <label><Text>{"Opening date"}</Text><input name="opened_on" type="date" defaultValue={data.kingdom.opened_on ?? ""} /></label>
                <label><Text>{"Season or progression"}</Text><input name="season" maxLength={80} defaultValue={data.kingdom.season ?? ""} /></label>
                <label><Text>{"King"}</Text><input name="king_name" maxLength={60} defaultValue={data.kingdom.king_name ?? ""} /></label>
                <label><Text>{"Ruling alliance tag"}</Text><input name="ruling_alliance" maxLength={40} defaultValue={data.kingdom.ruling_alliance ?? ""} /></label>
              </div>
              <label><Text>{"Notes"}</Text><textarea name="notes" maxLength={2000} defaultValue={data.kingdom.notes ?? ""} /></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Save"}</Text></button><button type="button" className="intel-button" onClick={() => setEditing(false)}><Text>{"Cancel"}</Text></button></div>
            </form>
          )}
        </div>
      )}

      {day !== null && data.kingdom.opened_on && (
        <section className="intel-section">
          <div className="intel-section-head"><div>
            <h2><Text>{"Server progression"}</Text></h2>
            <p><Text>{"Server-age events and seasons maintained by leadership. Estimated days are marked; the game announces a new era about five days before it starts."}</Text></p>
          </div></div>
          {data.milestones.length > 0 && (() => {
            const span = Math.max(day + 30, ...data.milestones.map((m) => m.end_day ?? m.start_day)) + 5;
            const pct = (value: number) => `${Math.min(100, (value / span) * 100)}%`;
            return (
              <div className="intel-track" aria-hidden="true">
                {data.milestones.map((m) => (
                  <span key={m.id} className={`intel-track-item is-${m.kind} ${m.certainty === "estimated" ? "is-estimated" : ""}`}
                    style={{ insetInlineStart: pct(m.start_day), width: m.end_day ? `calc(${pct(m.end_day - m.start_day + 1)})` : undefined }} title={m.title} />
                ))}
                <span className="intel-track-today" style={{ insetInlineStart: pct(day) }}><b>{t("Day {day}", { day })}</b></span>
              </div>
            );
          })()}
          <ol className="intel-timeline">
            {data.milestones.map((m) => {
              const status = (m.end_day ?? m.start_day) < day ? "past" : m.start_day > day ? "upcoming" : "current";
              return (
                <li key={m.id} className={`is-${status}`}>
                  <time>{m.end_day ? t("Days {from}–{to}", { from: m.start_day, to: m.end_day }) : t("Day {day}", { day: m.start_day })}<small style={{ display: "block" }}>{day_(dateOfDay(data.kingdom.opened_on!, m.start_day))}</small></time>
                  <div>
                    <h3>{m.title}</h3>
                    {m.notes && <p>{m.notes}</p>}
                    <span className="intel-source">
                      <span>{status === "past" ? t("Done") : status === "current" ? t("Now") : t("In {days} days", { days: m.start_day - day })}</span>
                      <span className={m.certainty === "confirmed" ? "is-verified" : "is-missing"}>{m.certainty === "confirmed" ? t("Confirmed") : t("Estimated")}</span>
                      {data.viewer.leadership && <button type="button" className="intel-button" style={{ minHeight: 24, padding: "0 8px" }} disabled={busy}
                        aria-label={t("Remove {title}", { title: m.title })}
                        onClick={() => void send(`/api/intel/kingdom/milestones?id=${m.id}`, "DELETE", {}, t("Milestone removed."))}>×</button>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {data.viewer.leadership && (
            <form className="intel-form intel-panel" style={{ marginTop: 16 }} onSubmit={addMilestone}>
              <div className="intel-form-row">
                <label><Text>{"Title"}</Text><input name="title" required maxLength={80} /></label>
                <label><Text>{"Start day"}</Text><input name="start_day" type="number" min={1} max={5000} required /></label>
                <label><Text>{"End day (optional)"}</Text><input name="end_day" type="number" min={1} max={5000} /></label>
                <label><Text>{"Type"}</Text><select name="kind" defaultValue="event"><option value="event">{t("Event")}</option><option value="season">{t("Season")}</option><option value="unlock">{t("Unlock")}</option><option value="other">{t("Other")}</option></select></label>
                <label><Text>{"Certainty"}</Text><select name="certainty" defaultValue="estimated"><option value="estimated">{t("Estimated")}</option><option value="confirmed">{t("Confirmed")}</option></select></label>
              </div>
              <label><Text>{"Notes"}</Text><input name="notes" maxLength={300} /></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Add milestone"}</Text></button></div>
            </form>
          )}
        </section>
      )}

      <section className="intel-section">
        <div className="intel-section-head">
          <div>
            <h2><Text>{"Alliance standings"}</Text></h2>
            <p><Text values={{ count: tracked }}>{"Order among the {count} alliances BurnFire tracks. The provider offers no kingdom-wide ranking, so this is not the official kingdom order."}</Text></p>
          </div>
        </div>
        <div className="intel-toolbar">
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder={t("Search tag or name")} aria-label={t("Search alliances")} />
          {data.viewer.leadership && (
            <form onSubmit={track} style={{ display: "flex", gap: 8 }}>
              <input name="tag" required maxLength={18} placeholder={t("Alliance tag")} aria-label={t("Alliance tag to track")} style={{ width: 140, minHeight: 40 }} />
              <button className="intel-button" disabled={busy}><Text>{"Track alliance"}</Text></button>
            </form>
          )}
        </div>
        <div className="intel-table-wrap">
          <table className="intel-table">
            <thead><tr>
              <th scope="col" className="intel-hide-mobile"><span className="intel-sr"><Text>{"Compare"}</Text></span></th>
              {header("position", "#")}
              {header("tag", t("Alliance"), "is-start")}
              {header("total_power", t("Power"))}
              {header("member_count", t("Members"), "intel-hide-mobile")}
              {header("average_power", t("Average"), "intel-hide-mobile intel-hide-tablet")}
              {header("growth_24h", t("24h"), "intel-hide-mobile intel-hide-tablet")}
              {header("growth_7d_pct", t("7 days"))}
              {header("growth_30d_pct", t("30 days"), "intel-hide-mobile")}
              <th scope="col" className="intel-hide-mobile intel-hide-tablet"><Text>{"Synced"}</Text></th>
            </tr></thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={row.is_home ? "is-home" : undefined}>
                  <td className="intel-hide-mobile" style={{ width: 36 }}>
                    <input type="checkbox" checked={row.id in slots} onChange={() => toggle(row.id)} aria-label={t("Compare {tag}", { tag: row.tag })} style={{ width: 18, height: 18, accentColor: "#ff9059" }} />
                  </td>
                  <td className="intel-num">
                    {row.position ?? "—"}
                    {row.position_change_7d ? <small style={{ display: "block" }}><Delta value={row.position_change_7d}>{Math.abs(row.position_change_7d)}</Delta></small> : null}
                  </td>
                  <td style={{ textAlign: "start" }}>
                    <div className="intel-member"><div>
                      <strong style={{ fontWeight: 500 }}>[{row.tag}]</strong> {row.name}
                      {row.is_home && <> <span className="intel-chip is-ember"><Text>{"YOUR ALLIANCE"}</Text></span></>}
                      {data.relations[row.id] && <> <span className={`intel-stance is-${data.relations[row.id]}`}>{stanceLabels[data.relations[row.id]]}</span></>}
                      <small>
                        {row.members_with_power !== null && row.member_count !== null && row.members_with_power < row.member_count
                          ? t("Power reported for {reported} of {total} members", { reported: row.members_with_power, total: row.member_count })
                          : row.level ? t("Level {level}", { level: row.level }) : ""}
                        {row.failing && ` · ${t("Last sync failed")}`}
                      </small>
                    </div></div>
                  </td>
                  <td className="intel-num" title={full(row.total_power, locale)}>{compact(row.total_power, locale)}</td>
                  <td className="intel-hide-mobile">{row.member_count ?? "—"}{row.member_change_7d ? <small style={{ display: "block" }}><Delta value={row.member_change_7d}>{Math.abs(row.member_change_7d)}</Delta></small> : null}</td>
                  <td className="intel-hide-mobile intel-hide-tablet">{compact(row.average_power, locale)}</td>
                  <td className="intel-hide-mobile intel-hide-tablet"><Delta value={row.growth_24h}>{signed(row.growth_24h, locale)}</Delta></td>
                  <td><Delta value={row.growth_7d_pct}>{percent(row.growth_7d_pct, locale)}</Delta></td>
                  <td className="intel-hide-mobile"><Delta value={row.growth_30d_pct}>{percent(row.growth_30d_pct, locale)}</Delta></td>
                  <td className="intel-hide-mobile intel-hide-tablet">
                    {relative(row.last_success_at, locale)}
                    {data.viewer.leadership && !row.is_home && (
                      <button type="button" className="intel-button" style={{ marginInlineStart: 8, minHeight: 28, padding: "2px 8px" }} disabled={busy}
                        onClick={() => void send("/api/intel/kingdom/alliances", "PATCH", { id: row.id, tracked: false }, t("Tracking stopped. Existing history is kept."))}
                        aria-label={t("Stop tracking {tag}", { tag: row.tag })}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="intel-empty"><Text>{"No alliances are tracked yet. Leadership can add alliances by tag."}</Text></p>}
        </div>
        <div className="intel-pager">
          <span><Text values={{ shown: visible.length, total: rows.length }}>{"Showing {shown} of {total}"}</Text></span>
          <div>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><Text>{"Previous"}</Text></button>
            <button type="button" disabled={(page + 1) * pageSize >= rows.length} onClick={() => setPage(page + 1)}><Text>{"Next"}</Text></button>
          </div>
        </div>
      </section>

      <section className="intel-section">
        <div className="intel-section-head">
          <div><h2><Text>{"Compare alliances"}</Text></h2><p><Text>{"Select up to six alliances in the table. History begins when each alliance was first tracked."}</Text></p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="intel-segment" role="group" aria-label={t("Measure")}>
              {(["total", "members", "average"] as Metric[]).map((key) => (
                <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}>{{ total: t("Power"), members: t("Members"), average: t("Average") }[key]}</button>
              ))}
            </div>
            <div className="intel-segment" role="group" aria-label={t("Period")}>
              {[7, 30, 90, 180].map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{t("{days}D", { days: value })}</button>)}
            </div>
          </div>
        </div>
        {compareIds.length === 0 ? <p className="intel-empty"><Text>{"Select alliances in the table to compare them."}</Text></p> : (
          <>
            <LineChart label={t("{measure} comparison", { measure: metricLabel })} start={Date.now() - days * 86_400_000}
              valueFormat={metric === "members" ? (value) => String(Math.round(value)) : undefined} integer={metric === "members"}
              series={data.comparison.filter((item) => item.id in slots).map((item) => ({
                id: item.id, label: `[${byId.get(item.id)?.tag ?? "?"}]`, color: SERIES_COLORS[slots[item.id]],
                points: item.points.map((point) => ({ t: point.t, v: point[metric] })),
              }))} />
            {data.comparison.filter((item) => item.gap_days > 1).map((item) => (
              <p className="intel-note" key={item.id}>
                {item.coverage_start === null
                  ? t("[{tag}] has no history in this period.", { tag: byId.get(item.id)?.tag ?? "?" })
                  : t("[{tag}] history starts {date}; the first {days} days of this period have no data.", { tag: byId.get(item.id)?.tag ?? "?", date: dayLabel(item.coverage_start, locale), days: item.gap_days })}
              </p>
            ))}
          </>
        )}
      </section>

      <div className="intel-split">
        <section className="intel-section">
          <div className="intel-section-head"><div><h2><Text>{"Kingdom records"}</Text></h2><p><Text>{"Synced records are detected from provider data. Leadership records are entered by hand and marked as verified or reported."}</Text></p></div></div>
          {data.events.length === 0 ? <p className="intel-empty"><Text>{"No kingdom records yet."}</Text></p> : (
            <ol className="intel-timeline">
              {data.events.map((event) => (
                <li key={event.id}>
                  <time dateTime={event.occurred_at}>{dayLabel(event.occurred_at, locale)}</time>
                  <div>
                    <h3>{event.title}</h3>
                    {event.body && <p>{event.body}</p>}
                    <span className="intel-source">
                      <span>{kindLabels[event.kind] ?? event.kind}</span>
                      <span className={event.source === "derived" ? "is-synced" : "is-manual"}>{event.source === "derived" ? t("Synced") : t("Leadership record")}</span>
                      <span className={event.verification === "verified" ? "is-verified" : ""}>{event.verification === "verified" ? t("Verified") : t("Reported")}</span>
                      {event.visibility === "leadership" && <span><Text>{"Leadership only"}</Text></span>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <aside className="intel-aside">
          {data.viewer.leadership && (
            <section>
              <h2><Text>{"Add a kingdom record"}</Text></h2>
              <form className="intel-form" onSubmit={addRecord}>
                <div className="intel-form-row">
                  <label><Text>{"Date"}</Text><input name="occurred_at" type="date" required /></label>
                  <label><Text>{"Type"}</Text>
                    <select name="kind" defaultValue="throne">{["throne", "merger", "disband", "ranking", "kvk", "season", "diplomacy", "other"].map((kind) => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}</select>
                  </label>
                </div>
                <label><Text>{"Title"}</Text><input name="title" required maxLength={160} /></label>
                <label><Text>{"Details"}</Text><textarea name="body" maxLength={2000} /></label>
                <div className="intel-form-row">
                  <label><Text>{"Alliance"}</Text>
                    <select name="alliance_id" defaultValue=""><option value="">{t("None")}</option>{data.standings.map((row) => <option key={row.id} value={row.id}>[{row.tag}] {row.name}</option>)}</select>
                  </label>
                  <label><Text>{"Confidence"}</Text>
                    <select name="verification" defaultValue="reported"><option value="reported">{t("Reported")}</option><option value="verified">{t("Verified")}</option></select>
                  </label>
                  <label><Text>{"Visible to"}</Text>
                    <select name="visibility" defaultValue="members"><option value="members">{t("Alliance members")}</option><option value="leadership">{t("Leadership only")}</option><option value="public">{t("Public")}</option></select>
                  </label>
                </div>
                <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Add record"}</Text></button></div>
              </form>
            </section>
          )}
          <section>
            <h2><Text>{"What the data provider supplies"}</Text></h2>
            <ul className="intel-feed">
              <li><span aria-hidden="true">✓</span><span><Text>{"Alliance power, members, and level"}</Text><small><Text>{"Synced for each tracked alliance"}</Text></small></span><time /></li>
              <li><span aria-hidden="true">✓</span><span><Text>{"Name and tag changes"}</Text><small><Text>{"Detected by the provider's stable alliance ID"}</Text></small></span><time /></li>
              <li><span aria-hidden="true">–</span><span><Text>{"Official kingdom ranking, king, and throne"}</Text><small><Text>{"Not in the provider's public API. Leadership records fill the gap."}</Text></small></span><time /></li>
              <li><span aria-hidden="true">–</span><span><Text>{"Player locations and online times"}</Text><small><Text>{"Never collected for other alliances, by policy"}</Text></small></span><time /></li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
