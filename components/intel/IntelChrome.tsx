"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { dateTime, relative, trend } from "@/lib/intel/format";
import "./intel.css";

export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"];
export const EMBER = "#ff9059";

export function IntelNav({ leadership, platform }: { leadership: boolean; platform: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const links = [
    { href: "/intel", label: t("Alliance"), show: true },
    { href: "/intel/kingdom", label: t("Kingdom"), show: true },
    { href: "/intel/leadership", label: t("Leadership"), show: leadership },
    { href: "/intel/integration", label: t("Integration"), show: platform },
  ].filter((link) => link.show);
  return (
    <nav className="intel-nav" aria-label={t("Intelligence sections")}>
      {links.map((link) => {
        const current = link.href === "/intel" ? pathname === "/intel" || pathname.startsWith("/intel/members") : pathname.startsWith(link.href);
        return <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined}>{link.label}</Link>;
      })}
    </nav>
  );
}

export function IntelHeader({ kicker, title, children, nav }: { kicker: ReactNode; title: ReactNode; children?: ReactNode; nav: ReactNode }) {
  return (
    <header className="intel-header">
      <div className="intel-header-row">
        <div>
          <span className="portal-kicker">{kicker}</span>
          <h1>{title}</h1>
        </div>
        {children && <div className="intel-header-meta">{children}</div>}
      </div>
      {nav}
    </header>
  );
}

export function Freshness({ synthetic, lastSuccess, observed, stale, failing }: {
  synthetic: boolean; lastSuccess: string | null; observed: string | null; stale: boolean; failing: boolean;
}) {
  const { locale } = useTranslation();
  return (
    <div className="intel-freshness">
      <span className={`intel-pulse ${!observed ? "is-none" : stale || failing ? "is-stale" : ""}`} aria-hidden="true" />
      <span>
        {observed
          ? <Text values={{ time: relative(observed, locale) }}>{"Game data from {time}"}</Text>
          : <Text>{"No verified data yet"}</Text>}
        {lastSuccess && <small title={dateTime(lastSuccess, locale)}><Text values={{ time: relative(lastSuccess, locale) }}>{"Last successful sync {time}"}</Text></small>}
      </span>
      {(stale || failing) && observed && !synthetic && (
        <p className="intel-warning" role="status"><Text>{"The provider has not delivered fresh data recently. Showing the last verified values."}</Text></p>
      )}
    </div>
  );
}

export function SyntheticBanner() {
  return (
    <div className="intel-synthetic" role="note">
      <strong><Text>{"SYNTHETIC TEST DATA"}</Text></strong>
      <span><Text>{"Every name and number on this page is generated for development. Nothing here describes real players or alliances."}</Text></span>
    </div>
  );
}

export function Delta({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const direction = trend(value);
  return (
    <span className={`intel-delta is-${direction}`}>
      {direction === "up" && <span aria-hidden="true">▲</span>}
      {direction === "down" && <span aria-hidden="true">▼</span>}
      {children}
    </span>
  );
}

const STATE_META: Record<string, { icon: string; tone: string }> = {
  active: { icon: "✓", tone: "good" },
  new_member: { icon: "✦", tone: "neutral" },
  excused: { icon: "‖", tone: "neutral" },
  needs_review: { icon: "◆", tone: "warning" },
  likely_inactive: { icon: "▲", tone: "serious" },
  insufficient_data: { icon: "?", tone: "muted" },
};

export function useActivityLabels(): Record<string, string> {
  const { t } = useTranslation();
  return {
    active: t("Active"), new_member: t("New member"), excused: t("Approved absence"),
    needs_review: t("Needs review"), likely_inactive: t("Inactive per last seen"), insufficient_data: t("Not enough data"),
  };
}

export function ActivityBadge({ state }: { state: string }) {
  const labels = useActivityLabels();
  const meta = STATE_META[state] ?? STATE_META.insufficient_data;
  return <span className={`intel-status is-${meta.tone}`}><span aria-hidden="true">{meta.icon}</span>{labels[state] ?? labels.insufficient_data}</span>;
}

export function Unavailable({ children }: { children: ReactNode }) {
  return <span className="intel-unavailable">{children}</span>;
}

export function Loading({ error }: { error: string | null }) {
  const { t } = useTranslation();
  return <div className="portal-panel" role={error ? "alert" : "status"}>{error ? t(error) : t("Loading intelligence...")}</div>;
}
