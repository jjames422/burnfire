"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api } from "@/lib/api/client";
import { compact, day, full, percent } from "@/lib/intel/format";
import { EMBER, Freshness, IntelHeader, IntelNav, Loading, SyntheticBanner } from "./IntelChrome";
import { GrowthWindows } from "./AllianceIntel";
import { LineChart } from "./LineChart";

type Growth = { available: true; delta: number; percent: number | null; fromTime: number } | { available: false; reason: string };
type Player = {
  synthetic: boolean;
  player: { id: string; uid: string; name: string; first_seen_at: string; is_self: boolean };
  alliance: { tag: string; name: string };
  freshness: { synthetic: boolean; last_success_at: string | null; last_observed_at: string | null; stale: boolean; failing: boolean };
  power: { t: number; v: number }[];
  sanctuary: { t: number; v: number }[];
  growth: Record<"24h" | "7d" | "30d" | "90d", Growth>;
  relative: { percentile_7d: number | null; percentile_30d: number | null; alliance_median_7d_pct: number | null; alliance_median_30d_pct: number | null; peers_7d: number };
  contributions: { day: string; honor: number | null; tech: number | null }[];
  names: { name: string; first_seen_at: string; last_seen_at: string }[];
  memberships: { status: string; first_seen_at: string; last_seen_at: string; left_detected_at: string | null; provider_joined_at: string | null }[];
  reviews: { id: string; status: string; opened_reason: string; opened_at: string; closed_at: string | null }[];
};

function Columns({ rows, label }: { rows: { day: string; value: number | null }[]; label: string }) {
  const { locale } = useTranslation();
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));
  if (!rows.some((row) => row.value !== null)) return <p className="intel-note"><Text>{"No contribution data recorded yet."}</Text></p>;
  return (
    <div className="intel-columns" role="list" aria-label={label}>
      {rows.map((row) => (
        <div key={row.day} role="listitem" title={`${day(row.day, locale)}: ${row.value === null ? "—" : full(row.value, locale)}`}
          aria-label={`${day(row.day, locale)}: ${row.value === null ? "—" : full(row.value, locale)}`}>
          <i style={{ height: `${row.value === null ? 0 : Math.max(2, (row.value / max) * 100)}%` }} className={row.value === null ? "is-missing" : ""} />
        </div>
      ))}
    </div>
  );
}

export function MemberDevelopment({ playerId }: { playerId: string }) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Player | null>(null);
  const [leadership, setLeadership] = useState(false);
  const [platform, setPlatform] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Player>(`/api/intel/players/${playerId}`).then((result) => {
      if (result.error || !result.data) return setError(result.error ?? "Progression could not be loaded.");
      setData(result.data);
    });
    void api<{ viewer?: { leadership: boolean; platform: boolean } }>("/api/intel/alliance").then((result) => {
      setLeadership(Boolean(result.data?.viewer?.leadership));
      setPlatform(Boolean(result.data?.viewer?.platform));
    });
  }, [playerId]);

  if (!data) return <Loading error={error} />;
  const { relative } = data;
  const current = data.power[data.power.length - 1]?.v ?? null;
  const sanctuary = data.sanctuary[data.sanctuary.length - 1]?.v ?? null;
  const membership = data.memberships[data.memberships.length - 1];

  return (
    <>
      <IntelHeader
        kicker={data.player.is_self ? <Text>{"YOUR PROGRESSION"}</Text> : <Text values={{ tag: data.alliance.tag }}>{"MEMBER PROGRESSION · [{tag}]"}</Text>}
        title={<>{data.player.name}<small><Text values={{ uid: data.player.uid }}>{"Character ID {uid}"}</Text></small></>}
        nav={<IntelNav leadership={leadership} platform={platform} />}
      >
        <Freshness synthetic={data.freshness.synthetic} lastSuccess={data.freshness.last_success_at} observed={data.freshness.last_observed_at} stale={data.freshness.stale} failing={data.freshness.failing} />
      </IntelHeader>
      {data.synthetic && <SyntheticBanner />}
      <p className="intel-note" style={{ marginBottom: 18 }}><Link href="/intel" style={{ color: "#ffb387" }}><Text>{"← Back to the alliance"}</Text></Link></p>

      <div className="intel-kpis">
        <div className="intel-kpi">
          <span><Text>{"Current power"}</Text></span>
          <strong className="intel-num" title={full(current, locale)}>{compact(current, locale)}</strong>
          <small><Text values={{ date: day(data.player.first_seen_at, locale) }}>{"Tracked since {date}"}</Text></small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Sanctuary"}</Text></span>
          <strong className="intel-num">{sanctuary ?? "—"}</strong>
          <small><Text>{"Latest reported level"}</Text></small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Pace vs alliance · 7d"}</Text></span>
          <strong className="intel-num">{relative.percentile_7d !== null ? t("Top {value}%", { value: Math.max(1, 100 - relative.percentile_7d) }) : "—"}</strong>
          <small>{relative.alliance_median_7d_pct !== null ? <Text values={{ value: percent(relative.alliance_median_7d_pct, locale) }}>{"Alliance median {value}"}</Text> : <Text>{"Needs 7 days of history"}</Text>}</small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Pace vs alliance · 30d"}</Text></span>
          <strong className="intel-num">{relative.percentile_30d !== null ? t("Top {value}%", { value: Math.max(1, 100 - relative.percentile_30d) }) : "—"}</strong>
          <small>{relative.alliance_median_30d_pct !== null ? <Text values={{ value: percent(relative.alliance_median_30d_pct, locale) }}>{"Alliance median {value}"}</Text> : <Text>{"Needs 30 days of history"}</Text>}</small>
        </div>
        <div className="intel-kpi">
          <span><Text>{"Membership"}</Text></span>
          <strong className="intel-num">{membership?.status === "active" ? t("Active") : t("Left")}</strong>
          <small>{membership?.provider_joined_at ? <Text values={{ date: day(membership.provider_joined_at, locale) }}>{"Joined {date} (game record)"}</Text> : <Text values={{ date: day(membership?.first_seen_at, locale) }}>{"First seen {date}"}</Text>}</small>
        </div>
      </div>
      <p className="intel-note" style={{ marginTop: -18, marginBottom: 30 }}><Text>{"Pace compares percentage growth, so a smaller account growing quickly ranks above a larger account growing slowly. Absolute power is never used to rank members here."}</Text></p>

      <div className="intel-split">
        <div>
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Power history"}</Text></h2><p><Text>{"Every recorded observation. History starts when the integration first saw this character; nothing earlier is estimated."}</Text></p></div></div>
            <LineChart label={t("Power over time")} area series={[{ id: "power", label: t("Power"), color: EMBER, points: data.power }]} />
            <GrowthWindows growth={data.growth} />
          </section>
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Sanctuary progression"}</Text></h2></div></div>
            <LineChart label={t("Sanctuary level over time")} height={150} step integer valueFormat={(value) => String(Math.round(value))}
              series={[{ id: "sanctuary", label: t("Sanctuary"), color: EMBER, points: data.sanctuary }]} />
          </section>
        </div>
        <aside className="intel-aside">
          <section>
            <h2><Text>{"Daily honor · 30 days"}</Text></h2>
            <Columns label={t("Daily honor")} rows={data.contributions.map((row) => ({ day: row.day, value: row.honor }))} />
            <p className="intel-note"><Text values={{ total: compact(data.contributions.reduce((sum, row) => sum + (row.honor ?? 0), 0), locale) }}>{"{total} total. Highest value seen each day."}</Text></p>
          </section>
          <section>
            <h2><Text>{"Daily tech donations · 30 days"}</Text></h2>
            <Columns label={t("Daily tech donations")} rows={data.contributions.map((row) => ({ day: row.day, value: row.tech }))} />
            <p className="intel-note"><Text values={{ total: compact(data.contributions.reduce((sum, row) => sum + (row.tech ?? 0), 0), locale) }}>{"{total} total. Highest value seen each day."}</Text></p>
          </section>
          <section>
            <h2><Text>{"Names"}</Text></h2>
            <ul className="intel-feed">
              {[...data.names].reverse().map((row) => (
                <li key={row.name}><span aria-hidden="true">↺</span><span>{row.name}<small>{day(row.first_seen_at, locale)} – {day(row.last_seen_at, locale)}</small></span><time /></li>
              ))}
            </ul>
            <p className="intel-note"><Text>{"The character ID stays the same through name changes, so history is never split or duplicated."}</Text></p>
          </section>
          {data.reviews.length > 0 && (
            <section>
              <h2><Text>{"Leadership reviews"}</Text></h2>
              <ul className="intel-feed">
                {data.reviews.map((row) => <li key={row.id}><span aria-hidden="true">◆</span><span>{row.opened_reason}<small>{row.status}</small></span><time>{day(row.opened_at, locale)}</time></li>)}
              </ul>
              <Link className="intel-note" href="/intel/leadership" style={{ color: "#ffb387" }}><Text>{"Open the review queue →"}</Text></Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
