"use client";

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

  if (!access) return <div className="portal-panel" role="status">{error ?? "Connecting to your headquarters..."}</div>;
  const officer = access.is_site_admin || Boolean(access.verified_at && ["r3", "r4", "r5"].includes(access.game_rank ?? ""));
  const percent = access.total_sections ? Math.round(access.completed_sections / access.total_sections * 100) : 0;
  return (
    <>
      <section className="portal-hero">
        <div className="portal-hero-copy">
          <span className="portal-kicker">YOUR NEXT CHAPTER STARTS HERE</span>
          <h1>Welcome home,<br /><em>{access.in_game_name}.</em></h1>
          <p>Your training, your alliance, your next move.<br />Everything you need. One headquarters.</p>
          <div className="portal-badges">
            <span>{access.game_rank ? access.game_rank.toUpperCase() : "ACADEMY APPLICANT"}</span>
            {access.alliance_title && <span>{TITLE_LABELS[access.alliance_title]}</span>}
            {access.is_site_admin && <span className="portal-admin-badge">SITE ADMIN</span>}
            {access.game_rank && !access.verified_at && <span>AWAITING VERIFICATION</span>}
          </div>
        </div>
        <img className="portal-hero-art" src="/images/burnfire/logo.png" alt="BurnFire alliance emblem" />
      </section>
      {error && <p className="portal-alert" role="alert">{error}</p>}
      {access.is_site_admin && summary && <section className="portal-panel portal-admin-tasks">
        <div className="portal-section-heading"><h2>Site administration</h2><Link href="/portal/members">Manage all accounts &rarr;</Link></div>
        <p>{summary.total_accounts} signed-up accounts · {summary.pending_approvals} awaiting approval · {summary.incomplete_profiles} incomplete profiles</p>
        <h3>Membership approval tasks</h3>
        {tasks.length === 0 ? <p>No membership approvals waiting.</p> : <ul>{tasks.map((task) => <li key={task.user_id}>
          <div><strong>{task.in_game_name}</strong><p>{task.email}</p><p>{task.requested_rank ? `Requests ${task.requested_rank.toUpperCase()}${task.requested_title ? ` / ${TITLE_LABELS[task.requested_title]}` : ""}` : "New signup - rank not yet requested"} · {new Date(task.created_at).toLocaleDateString()}</p></div>
          <Link className="portal-secondary" href={`/portal/members?q=${encodeURIComponent(task.in_game_name)}`}>Review / change</Link>
        </li>)}</ul>}
      </section>}
      {access.can_request_rank && !access.is_site_admin && !access.request_status ? (
        <section className="portal-panel portal-apply">
          <div><span className="portal-kicker">START YOUR JOURNEY</span><h2>{access.enrolled ? "Request your alliance rank." : "Join the academy."}</h2><p>No invitation? Submit your game ID and in-game rank. A site administrator will approve or correct your request before granting alliance permissions.</p></div>
          <form onSubmit={apply}>
            <label htmlFor="application-game-id">In-game player ID</label>
            <input id="application-game-id" required minLength={2} maxLength={80} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Your player identifier" />
            <RankRequestFields rank={rank} title={title} onRank={setRank} onTitle={setTitle} />
            <p>Your selection is a request, not permission to access officer tools. A site administrator will approve or correct it.</p>
            <button disabled={busy} className="portal-primary">{busy ? "Submitting..." : "Start my academy journey"}</button>
          </form>
        </section>
      ) : (
        <section className="portal-training-banner">
          <div><span className="portal-kicker">YOUR ACADEMY</span><h2>{access.completed_at ? "Ready for what comes next." : "A little progress. A stronger alliance."}</h2><p>{access.completed_sections} of {access.total_sections} current sections acknowledged</p></div>
          <div className="portal-progress-ring" style={{ background: `conic-gradient(var(--portal-ember) ${percent}%, #303139 0)` }}><span>{percent}%</span></div>
          <Link href="/academy" className="portal-primary">{access.completed_at ? "Review training" : "Continue training"} &rarr;</Link>
        </section>
      )}
      {access.request_status === "pending" && <p className="portal-notice" role="status">Your request for {access.requested_rank?.toUpperCase()}{access.requested_title ? ` / ${TITLE_LABELS[access.requested_title]}` : ""} is awaiting site-admin approval. You can train while you wait.</p>}
      <div className="portal-section-heading"><h2>Your alliance toolkit</h2><span>CONNECTED BY ONE ACCOUNT</span></div>
      <div className="portal-tile-grid">
        <Link href="/academy" className="portal-tile"><span className="portal-tile-number">01 / LEARN</span><h3>Academy</h3><p>Alliance essentials. Real confidence. Training at your own pace.</p><span className="portal-tile-action">Open your academy &rarr;</span></Link>
        <Link href="/chat" className="portal-tile"><span className="portal-tile-number">02 / CONNECT</span><h3>Alliance chat</h3><p>Plan your next move, ask a question, and find your people.</p><span className="portal-tile-action">Join the conversation &rarr;</span></Link>
        <Link href="/academy/announcements" className="portal-tile"><span className="portal-tile-number">03 / STAY READY</span><h3>Field updates</h3><p>Leadership notices and the instructions that matter.</p><span className="portal-tile-action">Read announcements &rarr;</span></Link>
        {officer && <Link href="/command" className="portal-tile portal-tile-featured"><span className="portal-tile-number">04 / LEAD</span><h3>Command Center</h3><p>Support your recruits, clear follow-ups, and keep the team moving.</p><span className="portal-tile-action">Enter command &rarr;</span></Link>}
      </div>
      {!access.verified_at && !access.is_site_admin && <p className="portal-footnote">Training is available while your application is reviewed. Private alliance channels require officer approval; completing training never changes your rank automatically.</p>}
      <div className="portal-security-prompt"><span><strong>Less friction. More protection.</strong> Set up a passkey for face, fingerprint, or device-PIN sign-in.</span><Link href="/portal/security">Set up sign-in &rarr;</Link></div>
    </>
  );
}
