"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import Link from "next/link";
import { useEffect, useState, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";
import type { AllianceTitle, GameRank } from "@/lib/api/types";
import { TITLE_LABELS } from "@/lib/identity";
import { RankRequestFields } from "./RankRequestFields";

type Access = {
  in_game_name: string;
  game_rank: GameRank | null;
  alliance_title: AllianceTitle | null;
  is_regent: boolean;
  verified_at: string | null;
  is_site_admin: boolean;
  enrolled: boolean;
  completed_sections: number;
  total_sections: number;
  completed_at: string | null;
  requested_rank: GameRank | null;
  requested_title: AllianceTitle | null;
  request_status: string | null;
  can_request_rank: boolean;
  game_identifier: string | null;
};
type ApprovalTask = { user_id: string; in_game_name: string; email: string; requested_rank: GameRank | null; requested_title: AllianceTitle | null; created_at: string };
type AdminSummary = { total_accounts: number; pending_approvals: number; incomplete_profiles: number };

export function PortalHome() {
  const { t, locale } = useTranslation();
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [rank, setRank] = useState<GameRank>("r1");
  const [title, setTitle] = useState<AllianceTitle | null>(null);
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);

  async function load() {
    const result = await api<{ access: Access | null; tasks: ApprovalTask[]; summary: AdminSummary | null }>("/api/portal");
    if (result.error || !result.data?.access) {
      setError(result.error ?? "Your player profile could not be loaded.");
      return;
    }
    setAccess(result.data.access);
    setIdentifier(result.data.access.game_identifier ?? "");
    setTasks(result.data.tasks);
    setSummary(result.data.summary);
    setError(null);
  }
  useEffect(() => { void load(); }, []);

  async function apply(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await apiPost("/api/portal/apply", { game_identifier: identifier, requested_rank: rank, requested_title: title });
    if (result.error) setError(result.error);
    else await load();
    setBusy(false);
  }

  if (!access) return <div className="portal-panel" role="status">{error ?? t("Connecting to your headquarters...")}</div>;
  const officer = access.is_site_admin || Boolean(access.verified_at && ["r3", "r4", "r5"].includes(access.game_rank ?? ""));
  const percent = access.total_sections ? Math.round(access.completed_sections / access.total_sections * 100) : 0;
  return (
    <>
      <section className="portal-hero">
        <div className="portal-hero-copy">
          <span className="portal-kicker"><Text>{"YOUR NEXT CHAPTER STARTS HERE"}</Text></span>
          <h1><Text>{"Welcome home,"}</Text><br /><em>{access.in_game_name}.</em></h1>
          <p><Text>{"Your training, your alliance, your next move."}</Text><br /><Text>{"Everything you need. One headquarters."}</Text></p>
          <div className="portal-badges">
            <span>{access.game_rank === "r5" ? t("Alliance Leader") : access.game_rank ? access.game_rank.toUpperCase() : t("ACADEMY APPLICANT")}</span>
            {access.alliance_title && <span>{t(TITLE_LABELS[access.alliance_title])}</span>}
            {access.is_regent && <span><Text>{"Regent"}</Text></span>}
            {access.is_site_admin && <span className="portal-admin-badge"><Text>{"SITE ADMIN"}</Text></span>}
            {access.game_rank && !access.verified_at && <span><Text>{"AWAITING VERIFICATION"}</Text></span>}
          </div>
        </div>
        <img className="portal-hero-art" src="/images/burnfire/logo.png" alt={t("BurnFire alliance emblem")} />
      </section>
      {error && <p className="portal-alert" role="alert">{t(error)}</p>}
      {access.is_site_admin && summary && <section className="portal-panel portal-admin-tasks">
        <div className="portal-section-heading"><h2><Text>{"Site administration"}</Text></h2><Link href="/portal/members"><Text>{"Manage all accounts →"}</Text></Link></div>
        <p><Text values={{ total_accounts: summary.total_accounts.toLocaleString(locale), pending_approvals: summary.pending_approvals.toLocaleString(locale), incomplete_profiles: summary.incomplete_profiles.toLocaleString(locale) }}>{"{total_accounts}  signed-up accounts · {pending_approvals}  awaiting approval · {incomplete_profiles}  incomplete profiles"}</Text></p>
        <h3><Text>{"Membership approval tasks"}</Text></h3>
        {tasks.length === 0 ? <p><Text>{"No membership approvals waiting."}</Text></p> : <ul>{tasks.map((task) => <li key={task.user_id}>
          <div><strong>{task.in_game_name}</strong><p>{task.email}</p><p>{task.requested_rank ? t("Requests {value1}{value2}", { value1: task.requested_rank.toUpperCase(), value2: task.requested_title ? ` / ${t(TITLE_LABELS[task.requested_title])}` : "" }) : t("New signup - rank not yet requested")} · {new Date(task.created_at).toLocaleDateString(locale)}</p></div>
          <Link className="portal-secondary" href={`/portal/members?q=${encodeURIComponent(task.in_game_name)}`}><Text>{"Review / change"}</Text></Link>
        </li>)}</ul>}
      </section>}
      {access.can_request_rank && !access.is_site_admin && !access.request_status ? (
        <section className="portal-panel portal-apply">
          <div><span className="portal-kicker"><Text>{"START YOUR JOURNEY"}</Text></span><h2>{access.enrolled ? t("Request your alliance rank.") : t("Join the academy.")}</h2><p><Text>{"No invitation? Submit your game ID and in-game rank. A site administrator will approve or correct your request before granting alliance permissions."}</Text></p></div>
          <form onSubmit={apply}>
            <label htmlFor="application-game-id"><Text>{"In-game player ID"}</Text></label>
            <input id="application-game-id" required minLength={2} maxLength={80} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={t("Your player identifier")} />
            <RankRequestFields rank={rank} title={title} onRank={setRank} onTitle={setTitle} />
            <p><Text>{"Your selection is a request, not permission to access officer tools. A site administrator will approve or correct it."}</Text></p>
            <button disabled={busy} className="portal-primary">{busy ? t("Submitting...") : t("Start my academy journey")}</button>
          </form>
        </section>
      ) : (
        <section className="portal-training-banner">
          <div><span className="portal-kicker"><Text>{"YOUR ACADEMY"}</Text></span><h2>{access.completed_at ? t("Ready for what comes next.") : t("A little progress. A stronger alliance.")}</h2><p><Text values={{ completed_sections: access.completed_sections.toLocaleString(locale), total_sections: access.total_sections.toLocaleString(locale) }}>{"{completed_sections}  of {total_sections}  current sections acknowledged"}</Text></p></div>
          <div className="portal-progress-ring" style={{ background: `conic-gradient(var(--portal-ember) ${percent}%, #303139 0)` }}><span>{<LocalizedNumber value={percent} />}%</span></div>
          <Link href="/academy" className="portal-primary">{access.completed_at ? t("Review training") : t("Continue training")} →</Link>
        </section>
      )}
      {access.request_status === "pending" && <p className="portal-notice" role="status"><Text>{"Your request for"}</Text>{" "}{access.requested_rank?.toUpperCase()}{access.requested_title ? ` / ${t(TITLE_LABELS[access.requested_title])}` : ""} {" "}<Text>{"is awaiting site-admin approval. You can train while you wait."}</Text></p>}
      <div className="portal-section-heading"><h2><Text>{"Your alliance toolkit"}</Text></h2><span><Text>{"CONNECTED BY ONE ACCOUNT"}</Text></span></div>
      <div className="portal-tile-grid">
        <Link href="/academy" className="portal-tile"><span className="portal-tile-number"><Text>{"01 / LEARN"}</Text></span><h3><Text>{"Academy"}</Text></h3><p><Text>{"Alliance essentials. Real confidence. Training at your own pace."}</Text></p><span className="portal-tile-action"><Text>{"Open your academy →"}</Text></span></Link>
        <Link href="/chat" className="portal-tile"><span className="portal-tile-number"><Text>{"02 / CONNECT"}</Text></span><h3><Text>{"Alliance chat"}</Text></h3><p><Text>{"Plan your next move, ask a question, and find your people."}</Text></p><span className="portal-tile-action"><Text>{"Join the conversation →"}</Text></span></Link>
        <Link href="/academy/announcements" className="portal-tile"><span className="portal-tile-number"><Text>{"03 / STAY READY"}</Text></span><h3><Text>{"Field updates"}</Text></h3><p><Text>{"Leadership notices and the instructions that matter."}</Text></p><span className="portal-tile-action"><Text>{"Read announcements →"}</Text></span></Link>
        {officer && <Link href="/command" className="portal-tile portal-tile-featured"><span className="portal-tile-number"><Text>{"04 / LEAD"}</Text></span><h3><Text>{"Command Center"}</Text></h3><p><Text>{"Support your recruits, clear follow-ups, and keep the team moving."}</Text></p><span className="portal-tile-action"><Text>{"Enter command →"}</Text></span></Link>}
      </div>
      {!access.verified_at && !access.is_site_admin && <p className="portal-footnote"><Text>{"Training is available while your application is reviewed. Private alliance channels require officer approval; completing training never changes your rank automatically."}</Text></p>}
      <div className="portal-security-prompt"><span><strong><Text>{"Less friction. More protection."}</Text></strong> {" "}<Text>{"Set up a passkey for face, fingerprint, or device-PIN sign-in."}</Text></span><Link href="/portal/security"><Text>{"Set up sign-in →"}</Text></Link></div>
    </>
  );
}
