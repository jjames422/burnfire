"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState, type SubmitEvent } from "react";
import { api } from "@/lib/api/client";
import type { AllianceRank } from "@/lib/command/access";
import { canAppointRegent, canAssignRank } from "@/lib/command/member-policy";
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
  is_regent: boolean;
  requested_rank: AllianceRank | null;
  requested_title: AllianceTitle | null;
  request_status: string | null;
  email: string | null;
};
type Roster = {
  members: Member[];
  history: { id: string; member_name: string; actor_name: string | null; previous_rank: string | null; new_rank: string; previous_title: AllianceTitle | null; new_title: AllianceTitle | null; previous_regent: boolean | null; new_regent: boolean | null; created_at: string }[];
  actor: { id: string; game_rank: AllianceRank | null; is_site_admin: boolean; is_regent: boolean };
  page: number;
  has_more: boolean;
};
const ranks: AllianceRank[] = ["r1", "r2", "r3", "r4", "r5"];

export function MemberManager() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<Roster | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ member: Member; rank: AllianceRank; title: AllianceTitle | null; isRegent: boolean } | null>(null);
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
  useEffect(() => {
    if (pending) document.getElementById("membership-confirmation")?.focus();
  }, [pending?.member.id]);
  function eligibleRanks(member: Member) {
    if (!data || !member.profile_complete || (member.request_status === "pending" && !data.actor.is_site_admin)) return [];
    return ranks.filter((rank) => canAssignRank(data.actor.game_rank, data.actor.is_site_admin, member.game_rank, rank, data.actor.is_regent)
      && (data.actor.is_site_admin || !member.is_site_admin)
      && (!member.is_regent || rank === "r4" || canAppointRegent(data.actor.game_rank, data.actor.is_site_admin)));
  }
  async function searchMembers(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(search);
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    const result = await api("/api/command/members", { method: "PATCH", body: JSON.stringify({ user_id: pending.member.id, game_rank: pending.rank, alliance_title: pending.title, is_regent: pending.isRegent }) });
    if (result.error) setError(result.error);
    else {
      setMessage(t("{name} is now approved as {rank}. Chat and portal permissions have been updated together.", { name: pending.member.in_game_name, rank: pending.rank.toUpperCase() }));
      setPending(null);
      await load(search);
    }
    setBusy(false);
  }
  return (
    <div className="portal-members">
      <header className="portal-page-heading"><span className="portal-kicker"><Text>{"LEADERSHIP WORKSPACE"}</Text></span><h1><Text>{"People make"}</Text><br /><em><Text>{"the alliance."}</Text></em></h1><p><Text>{"One membership. One rank. Consistent access across chat, academy, and command."}</Text></p></header>
      {error && <p className="portal-alert" role="alert">{t(error)}</p>}
      {message && <p className="portal-notice" role="status">{t(message)}</p>}
      {data?.actor.is_site_admin && supportUserId && <UserRecovery key={supportUserId} userId={supportUserId} onClose={() => setSupportUserId(null)} onSaved={() => load(search, data.page)} />}
      {pending && data && <section id="membership-confirmation" tabIndex={-1} className="portal-panel portal-confirm" aria-label={t("Confirm membership change")}><h2><Text values={{ in_game_name: String(pending.member.in_game_name ?? ""), value2: String(pending.rank.toUpperCase() ?? "") }}>{"Approve {in_game_name}  as {value2}?"}</Text></h2><p><Text>{"This verifies alliance membership and changes chat and Command Center permissions immediately. Site-admin privileges are separate and will not change."}</Text></p>
        <label className="portal-rank-select"><Text>{"Approve / change rank or title"}</Text><select disabled={busy} value={pending.rank} onChange={(event) => {
          const rank = eligibleRanks(pending.member).find((value) => value === event.target.value);
          if (rank) setPending({ ...pending, rank, title: rank === "r5" ? "alliance_leader" : rank === "r4" ? R4_TITLES.find((value) => value === pending.member.alliance_title) ?? null : null, isRegent: rank === "r4" && pending.member.is_regent });
        }}>{eligibleRanks(pending.member).map((rank) => <option key={rank} value={rank}>{rank.toUpperCase()}{rank === "r5" ? ` - ${t("Alliance Leader")}` : ""}</option>)}</select></label>
        {pending.rank === "r4" && <label className="portal-rank-select"><Text>{"Approved R4 title"}</Text><select disabled={busy} value={pending.title ?? ""} onChange={(event) => setPending({ ...pending, title: R4_TITLES.find((value) => value === event.target.value) ?? null })}><option value="" disabled={pending.isRegent}><Text>{"Officer (no special title)"}</Text></option>{R4_TITLES.map((title) => <option value={title} key={title}>{t(TITLE_LABELS[title])}</option>)}</select></label>}
        {pending.rank === "r4" && <label className="portal-regent-select"><input type="checkbox" checked={pending.isRegent} disabled={busy || !canAppointRegent(data.actor.game_rank, data.actor.is_site_admin)} onChange={(event) => setPending({ ...pending, isRegent: event.target.checked })} /><Text>{"Regent"}</Text></label>}
        {pending.rank === "r5" && <p><Text>{"Title: Alliance Leader"}</Text></p>}
        <p><Text>{"Access:"}</Text>{" "}{pending.rank === "r1" || pending.rank === "r2" ? t("Academy and private alliance chat") : t("Academy, private alliance chat, and Command Center")}{pending.rank === "r4" || pending.rank === "r5" ? t("; leadership controls according to rank") : ""}.</p>
        <div className="portal-actions"><button disabled={busy || (pending.isRegent && !pending.title)} onClick={() => void confirm()} className="portal-primary">{busy ? t("Saving...") : t("Confirm approval")}</button><button disabled={busy} onClick={() => setPending(null)} className="portal-secondary"><Text>{"Cancel"}</Text></button></div></section>}
      {data && <>
        <form className="portal-search" onSubmit={searchMembers}><label htmlFor="member-search"><Text>{"Find a player"}</Text></label><input id="member-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={data.actor.is_site_admin ? t("Search names or email addresses") : t("Search in-game names")} /><button className="portal-secondary"><Text>{"Search"}</Text></button></form>
        <div className="portal-section-heading"><h2>{data.actor.is_site_admin ? t("All users & account support") : t("Members & applications")}</h2><span><Text>{"100 USERS PER PAGE"}</Text></span></div>
        <div className="portal-member-grid">{data.members.map((member) => {
          const eligible = eligibleRanks(member);
          return <article className="portal-panel portal-member-card" key={member.id}>
            <div className="portal-member-heading"><span className="portal-avatar">{member.in_game_name.slice(0, 2).toUpperCase()}</span><div><h3>{member.in_game_name}</h3><span>{member.game_rank === "r5" ? t("Alliance Leader") : member.game_rank?.toUpperCase() ?? t("APPLICANT")}{member.is_site_admin ? t(" / SITE ADMIN") : ""}</span></div></div>
            <p className={member.verified_at ? "portal-approved" : "portal-pending"}>{member.verified_at ? t("Verified alliance member") : t("Awaiting officer approval")}</p>
            <p className="portal-detail"><Text values={{ value1: String(new Date(member.signed_up_at).toLocaleString(locale) ?? "") }}>{"Signed up: {value1}"}</Text></p>
            {member.email && <p className="portal-detail">{member.email}</p>}
            {data.actor.is_site_admin && <button className="portal-secondary portal-support-button" onClick={() => { setSupportUserId(member.id); setPending(null); }}><Text>{"Account support / reset"}</Text></button>}
            {!member.profile_complete && <p className="portal-pending"><Text>{"Waiting for this user to complete their player profile."}</Text></p>}
            {member.alliance_title && <p className="portal-detail"><Text values={{ value1: String(t(TITLE_LABELS[member.alliance_title]) ?? "") }}>{"Title: {value1}"}</Text></p>}
            {member.is_regent && <p className="portal-detail"><Text>{"Regent"}</Text></p>}
            {member.request_status === "pending" && <p className="portal-pending"><Text>{"Site-admin task: requests"}</Text>{" "}{member.requested_rank?.toUpperCase()}{member.requested_title ? ` / ${t(TITLE_LABELS[member.requested_title])}` : ""}</p>}
            {member.game_identifier && <p className="portal-detail"><Text values={{ game_identifier: String(member.game_identifier ?? "") }}>{"Game ID: {game_identifier}"}</Text></p>}
            {member.sponsor_name && <p className="portal-detail"><Text values={{ sponsor_name: String(member.sponsor_name ?? "") }}>{"Sponsor: {sponsor_name}"}</Text></p>}
            {["r3", "r4", "r5"].includes(member.game_rank ?? "") && <div className="portal-workload"><span><strong>{<LocalizedNumber value={member.assigned_recruits} />}</strong> {" "}<Text>{"assigned recruits"}</Text></span><span><strong>{<LocalizedNumber value={member.open_followups} />}</strong> {" "}<Text>{"open follow-ups"}</Text></span></div>}
            {eligible.length > 0 && <button className="portal-secondary" disabled={busy} onClick={() => {
              const rank = eligible.find((value) => value === (member.requested_rank ?? member.game_rank)) ?? eligible[0];
              const existingTitle = member.requested_rank === "r4" ? member.requested_title : member.alliance_title;
              setError(null);
              setMessage(null);
              setSupportUserId(null);
              setPending({ member, rank, title: rank === "r5" ? "alliance_leader" : rank === "r4" ? R4_TITLES.find((value) => value === existingTitle) ?? null : null, isRegent: rank === "r4" && member.is_regent });
            }}><Text>{"Approve / change rank or title"}</Text></button>}
          </article>;
        })}</div>
        <div className="portal-actions"><button disabled={busy || data.page === 1} className="portal-secondary" onClick={() => void load(search, data.page - 1)}><Text>{"Previous page"}</Text></button><span><Text values={{ page: String(data.page ?? "") }}>{"Page {page}"}</Text></span><button disabled={busy || !data.has_more} className="portal-secondary" onClick={() => void load(search, data.page + 1)}><Text>{"Next page"}</Text></button></div>
        {data.members.length === 0 && <p className="portal-panel"><Text>{"No members match. New applicants appear here after joining the academy from the portal."}</Text></p>}
        <div className="portal-section-heading"><h2><Text>{"Leadership activity"}</Text></h2></div>
        <div className="portal-panel portal-timeline">{data.history.length === 0 ? <p><Text>{"No rank changes recorded yet."}</Text></p> : data.history.map((item) => <div key={item.id}><span className="portal-timeline-dot" /><p><strong>{item.actor_name ?? t("Former officer")}</strong> {" "}<Text>{"approved"}</Text>{" "}<strong>{item.member_name}</strong>: {item.previous_rank?.toUpperCase() ?? t("Applicant")}{item.previous_title ? ` / ${t(TITLE_LABELS[item.previous_title])}` : ""}{item.previous_regent ? ` / ${t("Regent")}` : ""} → {item.new_rank.toUpperCase()}{item.new_title ? ` / ${t(TITLE_LABELS[item.new_title])}` : ""}{item.new_regent ? ` / ${t("Regent")}` : ""}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(locale)}</time></p></div>)}</div>
      </>}
    </div>
  );
}
