"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api } from "@/lib/api/client";
import { compact, day, full, percent, relative, signed } from "@/lib/intel/format";
import { ActivityBadge, Delta, EMBER, Freshness, IntelHeader, IntelNav, Loading, SyntheticBanner, Unavailable, useActivityLabels } from "./IntelChrome";
import { LineChart } from "./LineChart";

type Growth = { available: true; delta: number; percent: number | null; fromTime: number } | { available: false; reason: string };
type Member = {
  player_id: string; uid: string; name: string; previous_names: string[]; site_rank: string | null; is_self: boolean;
  power: number | null; sanctuary_level: number | null;
  growth_24h: number | null; growth_24h_pct: number | null; growth_7d: number | null; growth_7d_pct: number | null;
  growth_30d: number | null; growth_30d_pct: number | null;
  joined_at: string | null; first_seen_at: string; observed_at: string | null;
  honor_7d: number | null; tech_7d: number | null; contribution_days: number | null; weekly_activity: number | null;
  last_online_at: string | null; activity: { state: string; reasons: string[] } | null;
  on_absence: boolean | null; review_status: string | null;
};
export type Dashboard = {
  configured: true;
  freshness: { synthetic: boolean; last_success_at: string | null; last_observed_at: string | null; stale: boolean; failing: boolean };
  viewer: { leadership: boolean; platform: boolean; linked_player_id: string | null; threshold_days: number };
  alliance: { id: string; tag: string; name: string; level: number | null; kingdom: number; capacity: number | null };
  summary: null | {
    total_power: number | null; members_with_power: number; member_count: number; average_power: number | null; median_power: number | null;
    capacity: number | null; open_slots: number | null; growth: Record<"24h" | "7d" | "30d" | "90d", Growth>;
    tracked_position: { position: number; of: number } | null; growing_7d: number; measured_7d: number; median_growth_7d_pct: number | null;
    honor_7d: number; tech_7d: number;
  };
  series: { t: number; total: number | null; members: number; average: number | null }[];
  sanctuary: { level: number; count: number }[];
  changes: { player_id: string; name: string; kind: "joined" | "left"; at: string }[];
  renames: { player_id: string; name: string; previous: string; at: string }[];
  roster: Member[];
  flags: Record<string, number> | null;
  self_percentile: number | null;
} | { configured: false };

const RANGES = [{ key: "7d", days: 7 }, { key: "30d", days: 30 }, { key: "90d", days: 90 }] as const;

export function GrowthWindows({ growth }: { growth: Record<string, Growth> }) {
  const { t, locale } = useTranslation();
  const labels: Record<string, string> = { "24h": t("24 hours"), "7d": t("7 days"), "30d": t("30 days"), "90d": t("90 days") };
  return (
    <div className="intel-windows">
      {(["24h", "7d", "30d", "90d"] as const).map((key) => {
        const value = growth[key];
        return (
          <div key={key}>
            <span>{labels[key]}</span>
            {value?.available ? (
              <>
                <strong><Delta value={value.delta}>{signed(value.delta, locale)}</Delta></strong>
                <small className="intel-num"><Delta value={value.percent}>{percent(value.percent, locale, 2)}</Delta></small>
              </>
            ) : (
              <><strong><Unavailable>—</Unavailable></strong><small><Unavailable><Text>{"Not enough history yet"}</Text></Unavailable></small></>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AllianceIntel() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Extract<Dashboard, { configured: true }> | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");

  useEffect(() => {
    void api<Dashboard>("/api/intel/alliance").then((result) => {
      if (result.error || !result.data) return setError(result.error ?? "Intelligence could not be loaded.");
      if (!result.data.configured) return setUnconfigured(true);
      setData(result.data);
    });
  }, []);

  if (unconfigured) return <div className="portal-panel" role="status"><Text>{"Your alliance is not connected to a data provider yet."}</Text></div>;
  if (!data) return <Loading error={error} />;
  const { summary, alliance, viewer } = data;
  const self = data.roster.find((member) => member.is_self) ?? null;
  const days = RANGES.find((item) => item.key === range)!.days;
  const now = data.series.length ? data.series[data.series.length - 1].t : Date.now();
  const maxBar = Math.max(1, ...data.sanctuary.map((row) => row.count));
  const feed = [
    ...data.changes.map((row) => ({ ...row, previous: null as string | null })),
    ...data.renames.map((row) => ({ player_id: row.player_id, name: row.name, kind: "renamed" as const, at: row.at, previous: row.previous })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);

  return (
    <>
      <IntelHeader
        kicker={<Text values={{ kingdom: alliance.kingdom }}>{"ALLIANCE COMMAND CENTER · KINGDOM #{kingdom}"}</Text>}
        title={<><span className="intel-tag">[{alliance.tag}]</span>{alliance.name}</>}
        nav={<IntelNav leadership={viewer.leadership} platform={viewer.platform} />}
      >
        <Freshness synthetic={data.freshness.synthetic} lastSuccess={data.freshness.last_success_at} observed={data.freshness.last_observed_at} stale={data.freshness.stale} failing={data.freshness.failing} />
      </IntelHeader>
      {data.freshness.synthetic && <SyntheticBanner />}

      {!summary ? (
        <div className="portal-panel" role="status"><Text>{"The first synchronization has not completed yet. Statistics appear after the provider delivers data."}</Text></div>
      ) : (
        <>
          <div className="intel-kpis">
            <div className="intel-kpi">
              <span><Text>{"Total alliance power"}</Text></span>
              <strong className="intel-num" title={full(summary.total_power, locale)}>{compact(summary.total_power, locale)}</strong>
              <small>
                {summary.growth["7d"].available
                  ? <Delta value={summary.growth["7d"].delta}><Text values={{ change: signed(summary.growth["7d"].delta, locale) }}>{"{change} this week"}</Text></Delta>
                  : <Text>{"Weekly change appears after 7 days of history"}</Text>}
                {summary.members_with_power < summary.member_count && <><br /><Text values={{ reported: summary.members_with_power, total: summary.member_count }}>{"Power reported for {reported} of {total} members"}</Text></>}
              </small>
            </div>
            <div className="intel-kpi">
              <span><Text>{"Members"}</Text></span>
              <strong className="intel-num">{summary.member_count}{summary.capacity ? <small style={{ display: "inline", fontSize: 14 }}> / {summary.capacity}</small> : null}</strong>
              <small>{summary.open_slots !== null ? <Text values={{ count: summary.open_slots }}>{"{count} open positions"}</Text> : <Text>{"Capacity not set by leadership"}</Text>}</small>
            </div>
            <div className="intel-kpi">
              <span><Text>{"Average power"}</Text></span>
              <strong className="intel-num">{compact(summary.average_power, locale)}</strong>
              <small><Text values={{ value: compact(summary.median_power, locale) }}>{"Median {value}"}</Text></small>
            </div>
            <div className="intel-kpi">
              <span><Text>{"Tracked standing"}</Text></span>
              <strong className="intel-num">{summary.tracked_position ? `#${summary.tracked_position.position}` : "—"}</strong>
              <small>{summary.tracked_position
                ? <Text values={{ count: summary.tracked_position.of }}>{"Among {count} tracked alliances, not the official ranking"}</Text>
                : <Text>{"No other alliances tracked yet"}</Text>}</small>
            </div>
            <div className="intel-kpi">
              <span><Text>{"Growing this week"}</Text></span>
              <strong className="intel-num">{summary.measured_7d ? `${summary.growing_7d}/${summary.measured_7d}` : "—"}</strong>
              <small>{summary.median_growth_7d_pct !== null
                ? <Text values={{ value: percent(summary.median_growth_7d_pct, locale) }}>{"Median member growth {value}"}</Text>
                : <Text>{"Needs 7 days of history"}</Text>}</small>
            </div>
          </div>

          <div className="intel-split">
            <div>
              <section className="intel-section">
                <div className="intel-section-head">
                  <div><h2><Text>{"Alliance power"}</Text></h2><p><Text>{"Sum of reported member power at each synchronization. Breaks in the line are periods without data."}</Text></p></div>
                  <div className="intel-segment" role="group" aria-label={t("Period")}>
                    {RANGES.map((item) => <button key={item.key} type="button" aria-pressed={range === item.key} onClick={() => setRange(item.key)}>{item.key.toUpperCase()}</button>)}
                  </div>
                </div>
                <LineChart label={t("Alliance power over time")} area start={now - days * 86_400_000}
                  series={[{ id: "total", label: t("Total power"), color: EMBER, points: data.series.map((row) => ({ t: row.t, v: row.total })) }]} />
                <GrowthWindows growth={summary.growth} />
              </section>
              <div className="intel-pair">
                <section>
                <h2><Text>{"Sanctuary levels"}</Text></h2>
                {data.sanctuary.length === 0 ? <p className="intel-note"><Text>{"The provider has not reported sanctuary levels."}</Text></p> : (
                  <div className="intel-bars" role="list">
                    {data.sanctuary.map((row) => (
                      <div className="intel-bar" key={row.level} role="listitem" aria-label={t("Level {level}: {count} members", { level: row.level, count: row.count })}>
                        <span><Text values={{ level: row.level }}>{"Lv {level}"}</Text></span>
                        <div><i style={{ width: `${(row.count / maxBar) * 100}%` }} /></div>
                        <b>{row.count}</b>
                      </div>
                    ))}
                  </div>
                )}
                </section>
                <section>
                <h2><Text>{"Contributions this week"}</Text></h2>
                <p className="intel-num" style={{ fontSize: 13 }}>
                  <Text values={{ honor: compact(summary.honor_7d, locale), tech: compact(summary.tech_7d, locale) }}>{"{honor} honor earned · {tech} tech donated"}</Text>
                </p>
                <p className="intel-note"><Text>{"Sum of each member's highest daily total seen per day. Days without a synchronization are not counted."}</Text></p>
                </section>
              </div>
            </div>
            <aside className="intel-aside">
              <section>
                {self ? (
                  <div className="intel-self">
                    <span className="portal-kicker"><Text>{"YOUR PROGRESSION"}</Text></span>
                    <strong className="intel-num">{compact(self.power, locale)}</strong>
                    <p>
                      {self.growth_7d_pct !== null
                        ? <><Delta value={self.growth_7d_pct}>{percent(self.growth_7d_pct, locale)}</Delta>{" "}<Text>{"this week"}</Text></>
                        : <Text>{"Weekly growth appears after 7 days of history."}</Text>}
                      {data.self_percentile !== null && <><br /><Text values={{ value: data.self_percentile }}>{"Growing faster than {value}% of members, measured by percentage so every account size compares fairly."}</Text></>}
                    </p>
                    <Link href={`/intel/members/${self.player_id}`}><Text>{"Open your progression →"}</Text></Link>
                  </div>
                ) : (
                  <>
                    <h2><Text>{"Your progression"}</Text></h2>
                    <p className="intel-note"><Text>{"Your account is not linked to your in-game character yet. Leadership links accounts using the player ID you submitted."}</Text></p>
                  </>
                )}
              </section>
              <section>
                <h2><Text>{"Membership changes"}</Text> <small className="intel-note"><Text>{"· last 30 days"}</Text></small></h2>
                {feed.length === 0 ? <p className="intel-note"><Text>{"No joins, departures, or name changes recorded in the last 30 days."}</Text></p> : (
                  <ul className="intel-feed">
                    {feed.map((row) => (
                      <li key={`${row.kind}-${row.player_id}-${row.at}`}>
                        <span className={`is-${row.kind}`} aria-hidden="true">{row.kind === "joined" ? "+" : row.kind === "left" ? "−" : "↺"}</span>
                        <span>{row.name}<small>{row.kind === "joined" ? t("Joined") : row.kind === "left" ? t("Left the alliance") : t("Renamed from {name}", { name: row.previous ?? "" })}</small></span>
                        <time dateTime={row.at}>{day(row.at, locale)}</time>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      <Roster members={data.roster} leadership={viewer.leadership} flags={data.flags} thresholdDays={viewer.threshold_days} />
    </>
  );
}

type SortKey = "name" | "power" | "growth_24h" | "growth_7d_pct" | "growth_30d_pct" | "sanctuary_level" | "honor_7d" | "activity";

function Roster({ members, leadership, flags, thresholdDays }: { members: Member[]; leadership: boolean; flags: Record<string, number> | null; thresholdDays: number }) {
  const { t, locale } = useTranslation();
  const activityLabels = useActivityLabels();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [minSanctuary, setMinSanctuary] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "power", direction: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const pageSize = 25;
  const levels = [...new Set(members.map((member) => member.sanctuary_level).filter((value): value is number => value !== null))].sort((a, b) => a - b);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const order = ["likely_inactive", "needs_review", "insufficient_data", "new_member", "excused", "active"];
    const value = (member: Member): number | string => sort.key === "name" ? member.name.toLowerCase()
      : sort.key === "activity" ? order.indexOf(member.activity?.state ?? "active") : (member[sort.key] ?? Number.NEGATIVE_INFINITY);
    return members
      .filter((member) => !needle || member.name.toLowerCase().includes(needle) || member.uid.includes(needle)
        || member.previous_names.some((name) => name.toLowerCase().includes(needle)))
      .filter((member) => (member.sanctuary_level ?? 0) >= minSanctuary)
      .filter((member) => filter === "all" ? true
        : filter === "growing" ? (member.growth_7d ?? 0) > 0
        : filter === "flat" ? member.growth_7d !== null && member.growth_7d <= 0
        : member.activity?.state === filter)
      .sort((a, b) => {
        const left = value(a); const right = value(b);
        return (left < right ? -1 : left > right ? 1 : 0) * sort.direction;
      });
  }, [members, search, filter, minSanctuary, sort]);
  useEffect(() => setPage(0), [search, filter, minSanctuary]);

  const header = (key: SortKey, label: string, className = "") => (
    <th scope="col" className={className} aria-sort={sort.key === key ? (sort.direction === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((current) => ({ key, direction: current.key === key ? (current.direction === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}>
        {label}{sort.key === key && <span aria-hidden="true">{sort.direction === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));

  return (
    <section className="intel-section" aria-labelledby="roster-heading">
      <div className="intel-section-head">
        <div>
          <h2 id="roster-heading"><Text>{"Member roster"}</Text></h2>
          <p>{leadership
            ? <Text values={{ days: thresholdDays }}>{"Activity flags are prompts for leadership review, never automatic decisions. Flat power alone is never treated as inactivity. Policy: {days} days."}</Text>
            : <Text>{"Growth is shown as a percentage so every account size is compared fairly. Contribution details are visible to you and leadership only."}</Text>}</p>
        </div>
      </div>
      <div className="intel-toolbar">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Search name, former name, or character ID")} aria-label={t("Search members")} />
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("Filter members")}>
          <option value="all">{t("All members")}</option>
          <option value="growing">{t("Growing this week")}</option>
          <option value="flat">{t("No growth this week")}</option>
          {leadership && flags && Object.keys(flags).map((state) => <option key={state} value={state}>{`${activityLabels[state] ?? state} (${flags[state]})`}</option>)}
        </select>
        <select value={minSanctuary} onChange={(event) => setMinSanctuary(Number(event.target.value))} aria-label={t("Minimum sanctuary level")}>
          <option value={0}>{t("Any sanctuary level")}</option>
          {levels.map((level) => <option key={level} value={level}>{t("Sanctuary {level}+", { level })}</option>)}
        </select>
      </div>
      <div className="intel-table-wrap">
        <table className="intel-table">
          <thead>
            <tr>
              {header("name", t("Member"))}
              {header("power", t("Power"))}
              {header("growth_24h", t("24h"), "intel-hide-mobile")}
              {header("growth_7d_pct", t("7 days"))}
              {header("growth_30d_pct", t("30 days"), "intel-hide-mobile intel-hide-tablet")}
              {header("sanctuary_level", t("Sanctuary"), "intel-hide-mobile")}
              {leadership && header("honor_7d", t("Honor 7d"), "intel-hide-mobile intel-hide-tablet")}
              {leadership && header("activity", t("Status"), "intel-hide-mobile")}
              <th scope="col" className="intel-hide-mobile intel-hide-tablet"><Text>{"Observed"}</Text></th>
              <th scope="col" className="intel-expand-col"><span className="intel-sr"><Text>{"Details"}</Text></span></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((member) => (
              <Fragment key={member.player_id}>
                <tr className={member.is_self ? "is-self" : undefined}>
                  <td>
                    <div className="intel-member">
                      <div>
                        {leadership || member.is_self ? <Link href={`/intel/members/${member.player_id}`}>{member.name}</Link> : member.name}
                        {member.is_self && <> <span className="intel-chip is-ember"><Text>{"YOU"}</Text></span></>}
                        {member.site_rank && <> <span className="intel-chip">{member.site_rank.toUpperCase()}</span></>}
                        <small>{member.previous_names.length ? t("Formerly {names}", { names: member.previous_names.slice(0, 2).join(", ") }) : `ID ${member.uid}`}</small>
                      </div>
                    </div>
                  </td>
                  <td className="intel-num" title={full(member.power, locale)}>{compact(member.power, locale)}</td>
                  <td className="intel-hide-mobile"><Delta value={member.growth_24h}>{signed(member.growth_24h, locale)}</Delta></td>
                  <td><Delta value={member.growth_7d_pct}>{percent(member.growth_7d_pct, locale)}</Delta></td>
                  <td className="intel-hide-mobile intel-hide-tablet"><Delta value={member.growth_30d_pct}>{percent(member.growth_30d_pct, locale)}</Delta></td>
                  <td className="intel-hide-mobile">{member.sanctuary_level ?? "—"}</td>
                  {leadership && <td className="intel-hide-mobile intel-hide-tablet">{compact(member.honor_7d, locale)}</td>}
                  {leadership && <td className="intel-hide-mobile">{member.activity ? <ActivityBadge state={member.activity.state} /> : "—"}</td>}
                  <td className="intel-hide-mobile intel-hide-tablet">{relative(member.observed_at, locale)}</td>
                  <td className="intel-expand-col">
                    <button type="button" className="intel-expand" aria-expanded={open === member.player_id} aria-label={t("Show details for {name}", { name: member.name })}
                      onClick={() => setOpen(open === member.player_id ? null : member.player_id)}>{open === member.player_id ? "−" : "+"}</button>
                  </td>
                </tr>
                <tr className={`intel-detail-row ${open === member.player_id ? "is-open" : ""}`}>
                  <td colSpan={leadership ? 10 : 8}>
                    <dl>
                      <div><dt><Text>{"24h"}</Text></dt><dd>{signed(member.growth_24h, locale)}</dd></div>
                      <div><dt><Text>{"30 days"}</Text></dt><dd>{percent(member.growth_30d_pct, locale)}</dd></div>
                      <div><dt><Text>{"Sanctuary"}</Text></dt><dd>{member.sanctuary_level ?? "—"}</dd></div>
                      <div><dt><Text>{"Observed"}</Text></dt><dd>{relative(member.observed_at, locale)}</dd></div>
                      {leadership && <div><dt><Text>{"Status"}</Text></dt><dd>{member.activity ? <ActivityBadge state={member.activity.state} /> : "—"}</dd></div>}
                      {(leadership || member.is_self) && <div><dt><Text>{"Honor 7d"}</Text></dt><dd>{compact(member.honor_7d, locale)}</dd></div>}
                    </dl>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="intel-empty"><Text>{"No members match these filters."}</Text></p>}
      </div>
      <div className="intel-pager">
        <span><Text values={{ shown: visible.length, total: rows.length }}>{"Showing {shown} of {total}"}</Text></span>
        <div>
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><Text>{"Previous"}</Text></button>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><Text>{"Next"}</Text></button>
        </div>
      </div>
    </section>
  );
}
