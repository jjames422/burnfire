"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { api } from "@/lib/api/client";
import type { AllianceRank } from "@/lib/command/access";
import { canAssignRank } from "@/lib/command/member-policy";
import type { AllianceTitle } from "@/lib/api/types";
import { R4_TITLES, TITLE_LABELS } from "@/lib/identity";
import { UserRecovery } from "./UserRecovery";

type Member = {
  id: string;
  in_game_name: string;
  game_rank: AllianceRank | null;
  verified_at: string | null;
  is_site_admin: boolean;
  game_identifier: string | null;
  sponsor_name: string | null;
  assigned_recruits: number;
  open_followups: number;
  profile_complete: boolean;
  signed_up_at: string;
  alliance_title: AllianceTitle | null;
  requested_rank: AllianceRank | null;
  requested_title: AllianceTitle | null;
  request_status: string | null;
  email: string | null;
};
type Roster = {
  members: Member[];
  history: { id: string; member_name: string; actor_name: string | null; previous_rank: string | null; new_rank: string; created_at: string }[];
  actor: { id: string; game_rank: AllianceRank | null; is_site_admin: boolean };
  page: number;
  has_more: boolean;
};
const ranks: AllianceRank[] = ["r1", "r2", "r3", "r4", "r5"];

export function MemberManager() {
  const [data, setData] = useState<Roster | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ member: Member; rank: AllianceRank; title: AllianceTitle | null } | null>(null);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);

  async function load(query = "", page = 1) {
    const result = await api<Roster>(`/api/command/members?q=${encodeURIComponent(query)}&page=${page}`);
    if (result.error) setError(result.error);
    else { setData(result.data); setError(null); }
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearch(query);
    void load(query);
  }, []);
  async function searchMembers(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(search);
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    const result = await api("/api/command/members", { method: "PATCH", body: JSON.stringify({ user_id: pending.member.id, game_rank: pending.rank, alliance_title: pending.title }) });
    if (result.error) setError(result.error);
    else {
      setMessage(`${pending.member.in_game_name} is now approved as ${pending.rank.toUpperCase()}. Chat and portal permissions have been updated together.`);
      setPending(null);
      await load(search);
    }
    setBusy(false);
  }
  return (
    <div className="portal-members">
      <header className="portal-page-heading"><span className="portal-kicker">LEADERSHIP WORKSPACE</span><h1>People make<br /><em>the alliance.</em></h1><p>One membership. One rank. Consistent access across chat, academy, and command.</p></header>
      {error && <p className="portal-alert" role="alert">{error}</p>}
      {message && <p className="portal-notice" role="status">{message}</p>}
      {data?.actor.is_site_admin && supportUserId && <UserRecovery key={supportUserId} userId={supportUserId} onClose={() => setSupportUserId(null)} onSaved={() => load(search, data.page)} />}
      {pending && <section className="portal-panel portal-confirm" aria-label="Confirm membership change"><h2>Approve {pending.member.in_game_name} as {pending.rank.toUpperCase()}?</h2><p>This verifies alliance membership and changes chat and Command Center permissions immediately. Site-admin privileges are separate and will not change.</p>
        {pending.rank === "r4" && <label className="portal-rank-select">Approved R4 title<select value={pending.title ?? ""} onChange={(event) => setPending({ ...pending, title: R4_TITLES.find((value) => value === event.target.value) ?? null })}><option value="">Officer (no special title)</option>{R4_TITLES.map((title) => <option value={title} key={title}>{TITLE_LABELS[title]}</option>)}</select></label>}
        {pending.rank === "r5" && <p>Title: Alliance Leader</p>}
        <p>Access: {pending.rank === "r1" || pending.rank === "r2" ? "Academy and private alliance chat" : "Academy, private alliance chat, and Command Center"}{pending.rank === "r4" || pending.rank === "r5" ? "; leadership controls according to rank" : ""}.</p>
        <div className="portal-actions"><button disabled={busy} onClick={() => void confirm()} className="portal-primary">{busy ? "Saving..." : "Confirm approval"}</button><button disabled={busy} onClick={() => setPending(null)} className="portal-secondary">Cancel</button></div></section>}
      {data && <>
        <form className="portal-search" onSubmit={searchMembers}><label htmlFor="member-search">Find a player</label><input id="member-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={data.actor.is_site_admin ? "Search names or email addresses" : "Search in-game names"} /><button className="portal-secondary">Search</button></form>
        <div className="portal-section-heading"><h2>{data.actor.is_site_admin ? "All users & account support" : "Members & applications"}</h2><span>100 USERS PER PAGE</span></div>
        <div className="portal-member-grid">{data.members.map((member) => {
          const eligible = member.profile_complete && (member.request_status !== "pending" || data.actor.is_site_admin) ? ranks.filter((rank) => canAssignRank(data.actor.game_rank, data.actor.is_site_admin, member.game_rank, rank) && (data.actor.is_site_admin || !member.is_site_admin)) : [];
          return <article className="portal-panel portal-member-card" key={member.id}>
            <div className="portal-member-heading"><span className="portal-avatar">{member.in_game_name.slice(0, 2).toUpperCase()}</span><div><h3>{member.in_game_name}</h3><span>{member.game_rank?.toUpperCase() ?? "APPLICANT"}{member.is_site_admin ? " / SITE ADMIN" : ""}</span></div></div>
            <p className={member.verified_at ? "portal-approved" : "portal-pending"}>{member.verified_at ? "Verified alliance member" : "Awaiting officer approval"}</p>
            <p className="portal-detail">Signed up: {new Date(member.signed_up_at).toLocaleString()}</p>
            {member.email && <p className="portal-detail">{member.email}</p>}
            {data.actor.is_site_admin && <button className="portal-secondary portal-support-button" onClick={() => { setSupportUserId(member.id); setPending(null); }}>Account support / reset</button>}
            {!member.profile_complete && <p className="portal-pending">Waiting for this user to complete their player profile.</p>}
            {member.alliance_title && <p className="portal-detail">Title: {TITLE_LABELS[member.alliance_title]}</p>}
            {member.request_status === "pending" && <p className="portal-pending">Site-admin task: requests {member.requested_rank?.toUpperCase()}{member.requested_title ? ` / ${TITLE_LABELS[member.requested_title]}` : ""}</p>}
            {member.game_identifier && <p className="portal-detail">Game ID: {member.game_identifier}</p>}
            {member.sponsor_name && <p className="portal-detail">Sponsor: {member.sponsor_name}</p>}
            {["r3", "r4", "r5"].includes(member.game_rank ?? "") && <div className="portal-workload"><span><strong>{member.assigned_recruits}</strong> assigned recruits</span><span><strong>{member.open_followups}</strong> open follow-ups</span></div>}
            {eligible.length > 0 && <label className="portal-rank-select">Approve / change rank or title<select disabled={busy} value="" onChange={(event) => {
              const rank = eligible.find((value) => value === event.target.value);
              const existingTitle = member.requested_rank === "r4" ? member.requested_title : member.alliance_title;
              if (rank) setPending({ member, rank, title: rank === "r5" ? "alliance_leader" : rank === "r4" ? R4_TITLES.find((value) => value === existingTitle) ?? null : null });
            }}><option value="">Select an approved rank</option>{eligible.map((rank) => <option key={rank} value={rank}>{rank.toUpperCase()}</option>)}</select></label>}
          </article>;
        })}</div>
        <div className="portal-actions"><button disabled={busy || data.page === 1} className="portal-secondary" onClick={() => void load(search, data.page - 1)}>Previous page</button><span>Page {data.page}</span><button disabled={busy || !data.has_more} className="portal-secondary" onClick={() => void load(search, data.page + 1)}>Next page</button></div>
        {data.members.length === 0 && <p className="portal-panel">No members match. New applicants appear here after joining the academy from the portal.</p>}
        <div className="portal-section-heading"><h2>Leadership activity</h2><span>LATEST 30 RANK CHANGES</span></div>
        <div className="portal-panel portal-timeline">{data.history.length === 0 ? <p>No rank changes recorded yet.</p> : data.history.map((item) => <div key={item.id}><span className="portal-timeline-dot" /><p><strong>{item.actor_name ?? "Former officer"}</strong> approved <strong>{item.member_name}</strong>: {item.previous_rank?.toUpperCase() ?? "Applicant"} &rarr; {item.new_rank.toUpperCase()}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></p></div>)}</div>
      </>}
    </div>
  );
}
