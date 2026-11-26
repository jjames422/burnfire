"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api, apiPost } from "@/lib/api/client";
import { day, relative } from "@/lib/intel/format";
import { ActivityBadge, IntelHeader, IntelNav, Loading, SyntheticBanner } from "./IntelChrome";
import type { Dashboard } from "./AllianceIntel";

type Row = Record<string, string | null> & { id: string };
type Desk = {
  capacity: number | null; kingdom_public: boolean; inactivity_days: number;
  reviews: (Row & { player_id: string; name: string; status: string; opened_reason: string; opened_at: string; closed_at: string | null })[];
  review_events: (Row & { review_id: string; kind: string; body: string | null; from_status: string | null; to_status: string | null; created_at: string; actor_name: string | null })[];
  absences: (Row & { player_id: string; name: string; starts_on: string; ends_on: string; reason: string | null })[];
  alliances: { id: string; tag: string; name: string }[];
  relations: { alliance_id: string; stance: string; summary: string | null; updated_at: string; updated_by_name: string | null }[];
  relation_history: { alliance_id: string; from_stance: string | null; to_stance: string; note: string | null; created_at: string; actor_name: string | null }[];
  treaties: (Row & { alliance_id: string; kind: string; status: string; title: string; terms: string | null; starts_on: string | null; ends_on: string | null })[];
  contacts: (Row & { alliance_id: string; in_game_name: string; role: string | null; notes: string | null })[];
  notes: (Row & { category: string; title: string; body: string; alliance_id: string | null; created_at: string; author: string | null })[];
  links: { user_id: string; player_id: string; site_name: string | null; player_name: string; uid: string }[];
  link_candidates: { user_id: string; site_name: string; game_identifier: string | null; player_id: string; player_name: string; uid: string; matched_by: string }[];
  unlinked_members: { user_id: string; site_name: string }[];
  roster: { id: string; name: string; uid: string }[];
};
type Tab = "reviews" | "absences" | "diplomacy" | "notes" | "links" | "settings";

export function LeadershipDesk() {
  const { t, locale } = useTranslation();
  const [desk, setDesk] = useState<Desk | null>(null);
  const [dashboard, setDashboard] = useState<Extract<Dashboard, { configured: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("reviews");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [deskResult, dashboardResult] = await Promise.all([api<Desk>("/api/intel/leadership"), api<Dashboard>("/api/intel/alliance")]);
    if (deskResult.error || !deskResult.data) return setError(deskResult.error ?? "Leadership data could not be loaded.");
    setDesk(deskResult.data);
    if (dashboardResult.data?.configured) setDashboard(dashboardResult.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const result = await apiPost("/api/intel/leadership", body);
    setBusy(false);
    setMessage(result.error ? t(result.error) : success);
    if (!result.error) await load();
    return !result.error;
  }
  const submit = (build: (values: Record<string, string>) => Record<string, unknown>, success: string) => async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await act(build(Object.fromEntries(new FormData(form)) as Record<string, string>), success)) form.reset();
  };

  if (!desk) return <Loading error={error} />;
  const statusLabels: Record<string, string> = {
    needs_review: t("Needs review"), monitoring: t("Monitoring"), warned: t("Warned"), excused: t("Excused"),
    cleared: t("Cleared"), confirmed_inactive: t("Confirmed inactive"),
  };
  const reasonLabels: Record<string, string> = {
    no_power_growth: t("No power growth across the policy window"),
    no_weekly_activity: t("Weekly activity reported as zero"),
    last_online_beyond_threshold: t("Last seen online more than {days} days ago", { days: desk.inactivity_days }),
  };
  const stanceLabels: Record<string, string> = { allied: t("Allied"), nap: t("NAP"), neutral: t("Neutral"), watch: t("Watch"), rival: t("Rival"), hostile: t("Hostile") };
  const allianceName = (id: string | null) => { const row = desk.alliances.find((item) => item.id === id); return row ? `[${row.tag}] ${row.name}` : "—"; };
  const openReviewPlayers = new Set(desk.reviews.filter((row) => !row.closed_at).map((row) => row.player_id));
  const flagged = (dashboard?.roster ?? []).filter((member) => member.activity && ["needs_review", "likely_inactive"].includes(member.activity.state) && !openReviewPlayers.has(member.player_id));
  const open = desk.reviews.filter((row) => !row.closed_at);
  const closed = desk.reviews.filter((row) => row.closed_at);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "reviews", label: t("Review queue"), count: flagged.length + open.length },
    { key: "absences", label: t("Absences"), count: desk.absences.length },
    { key: "diplomacy", label: t("Diplomacy") },
    { key: "notes", label: t("Notes"), count: desk.notes.length },
    { key: "links", label: t("Account links"), count: desk.link_candidates.length },
    { key: "settings", label: t("Settings") },
  ];

  return (
    <>
      <IntelHeader kicker={<Text>{"LEADERSHIP COMMAND · R4 AND R5 ONLY"}</Text>} title={<Text>{"Leadership desk"}</Text>}
        nav={<IntelNav leadership platform={Boolean(dashboard?.viewer.platform)} />}>
        <p className="intel-note" style={{ maxWidth: 360 }}><Text>{"Everything here is private to your alliance's R4 and R5 officers. Every change is recorded in the audit log."}</Text></p>
      </IntelHeader>
      {dashboard?.freshness.synthetic && <SyntheticBanner />}
      {message && <p className="intel-message" role="status">{message}</p>}
      <div className="intel-segment" role="tablist" aria-label={t("Leadership sections")} style={{ marginBottom: 26, flexWrap: "wrap" }}>
        {tabs.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}{item.count ? ` · ${item.count}` : ""}
          </button>
        ))}
      </div>

      {tab === "reviews" && (
        <div className="intel-split">
          <div>
            <section className="intel-section">
              <div className="intel-section-head"><div>
                <h2><Text>{"Flagged by the data"}</Text></h2>
                <p><Text values={{ days: desk.inactivity_days }}>{"Prompts to look, not verdicts. Flat power alone never means inactive, and nothing happens until a leader decides. Policy: {days} days."}</Text></p>
              </div></div>
              {flagged.length === 0 ? <p className="intel-empty"><Text>{"No members are flagged right now."}</Text></p> : (
                <ul className="intel-queue">
                  {flagged.map((member) => (
                    <li key={member.player_id}>
                      <div>
                        <h3><Link href={`/intel/members/${member.player_id}`}>{member.name}</Link> <ActivityBadge state={member.activity!.state} /></h3>
                        <p>{member.activity!.reasons.map((reason) => reasonLabels[reason] ?? reason).join(" · ")}{member.last_online_at && ` · ${t("Last seen {time}", { time: relative(member.last_online_at, locale) })}`}</p>
                      </div>
                      <button type="button" className="intel-button" disabled={busy}
                        onClick={() => void act({ action: "open_review", player_id: member.player_id, reason: member.activity!.reasons.map((reason) => reasonLabels[reason] ?? reason).join("; ").slice(0, 300) }, t("Review opened."))}>
                        <Text>{"Open review"}</Text>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="intel-section">
              <div className="intel-section-head"><div><h2><Text>{"Open reviews"}</Text></h2></div></div>
              {open.length === 0 ? <p className="intel-empty"><Text>{"No open reviews."}</Text></p> : open.map((review) => (
                <article className="intel-review" key={review.id}>
                  <header>
                    <div><h3 style={{ fontSize: 14, fontWeight: 500 }}><Link href={`/intel/members/${review.player_id}`}>{review.name}</Link></h3>
                      <p className="intel-note">{review.opened_reason} · <Text values={{ date: day(review.opened_at, locale) }}>{"opened {date}"}</Text></p></div>
                    <span className="intel-chip">{statusLabels[review.status]}</span>
                  </header>
                  <ol>
                    {desk.review_events.filter((event) => event.review_id === review.id).map((event) => (
                      <li key={event.id}>
                        <small>{day(event.created_at, locale)} · {event.actor_name ?? t("System")} · </small>
                        {event.kind === "status" ? t("Status: {from} → {to}", { from: statusLabels[event.from_status ?? ""] ?? "—", to: statusLabels[event.to_status ?? ""] ?? "—" })
                          : event.kind === "warning" ? t("Warning issued") : event.kind === "opened" ? t("Review opened") : t("Note")}
                        {event.body && <>: {event.body}</>}
                      </li>
                    ))}
                  </ol>
                  <form className="intel-form" onSubmit={submit((values) => values.mode === "status"
                    ? { action: "review_status", review_id: review.id, status: values.status, note: values.body || undefined }
                    : { action: "review_note", review_id: review.id, body: values.body, warning: values.mode === "warning" }, t("Review updated."))}>
                    <div className="intel-form-row">
                      <label><Text>{"Action"}</Text>
                        <select name="mode" defaultValue="note">
                          <option value="note">{t("Add a note")}</option>
                          <option value="warning">{t("Record a warning")}</option>
                          <option value="status">{t("Change status")}</option>
                        </select>
                      </label>
                      <label><Text>{"New status"}</Text>
                        <select name="status" defaultValue="monitoring">{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
                      </label>
                    </div>
                    <label><Text>{"Note"}</Text><textarea name="body" maxLength={1000} /></label>
                    <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Save"}</Text></button></div>
                  </form>
                </article>
              ))}
            </section>
          </div>
          <aside className="intel-aside">
            <section>
              <h2><Text>{"How decisions work"}</Text></h2>
              <p className="intel-note"><Text>{"Cleared, excused, and confirmed-inactive close a review. Confirming inactivity records the decision only; the site never removes, demotes, or messages anyone."}</Text></p>
            </section>
            <section>
              <h2><Text>{"Recently closed"}</Text></h2>
              {closed.length === 0 ? <p className="intel-note"><Text>{"Nothing closed in the last 60 days."}</Text></p> : (
                <ul className="intel-feed">{closed.map((review) => <li key={review.id}><span aria-hidden="true">✓</span><span>{review.name}<small>{statusLabels[review.status]}</small></span><time>{day(review.closed_at, locale)}</time></li>)}</ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {tab === "absences" && (
        <div className="intel-split">
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Approved absences"}</Text></h2><p><Text>{"Members on an approved absence are never flagged for inactivity during it."}</Text></p></div></div>
            {desk.absences.length === 0 ? <p className="intel-empty"><Text>{"No current or upcoming absences."}</Text></p> : (
              <ul className="intel-queue">{desk.absences.map((absence) => (
                <li key={absence.id}>
                  <div><h3>{absence.name}</h3><p>{day(absence.starts_on, locale)} – {day(absence.ends_on, locale)}{absence.reason && ` · ${absence.reason}`}</p></div>
                  <button type="button" className="intel-button is-danger" disabled={busy} onClick={() => void act({ action: "cancel_absence", id: absence.id }, t("Absence cancelled."))}><Text>{"Cancel"}</Text></button>
                </li>
              ))}</ul>
            )}
          </section>
          <aside className="intel-aside"><section>
            <h2><Text>{"Approve an absence"}</Text></h2>
            <form className="intel-form" onSubmit={submit((values) => ({ action: "add_absence", ...values, reason: values.reason || undefined }), t("Absence approved."))}>
              <label><Text>{"Member"}</Text><select name="player_id" required>{desk.roster.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
              <div className="intel-form-row">
                <label><Text>{"From"}</Text><input type="date" name="starts_on" required /></label>
                <label><Text>{"Until"}</Text><input type="date" name="ends_on" required /></label>
              </div>
              <label><Text>{"Reason (optional)"}</Text><input name="reason" maxLength={300} /></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Approve absence"}</Text></button></div>
            </form>
          </section></aside>
        </div>
      )}

      {tab === "diplomacy" && (
        <>
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Relationships"}</Text></h2><p><Text>{"Set by leadership only. Stances are never inferred from statistics."}</Text></p></div></div>
            <div className="intel-table-wrap">
              <table className="intel-table">
                <thead><tr><th scope="col"><Text>{"Alliance"}</Text></th><th scope="col" className="is-start"><Text>{"Stance"}</Text></th><th scope="col" className="is-start intel-hide-mobile"><Text>{"Summary"}</Text></th><th scope="col"><span className="intel-sr"><Text>{"Save"}</Text></span></th></tr></thead>
                <tbody>
                  {desk.alliances.map((alliance) => {
                    const relation = desk.relations.find((row) => row.alliance_id === alliance.id);
                    return (
                      <tr key={alliance.id}>
                        <td><div className="intel-member"><div>[{alliance.tag}] {alliance.name}{relation && <small>{t("Updated {time} by {name}", { time: relative(relation.updated_at, locale), name: relation.updated_by_name ?? "—" })}</small>}</div></div></td>
                        <td style={{ textAlign: "start" }}>
                          <select form={`relation-${alliance.id}`} name="stance" defaultValue={relation?.stance ?? "neutral"} aria-label={t("Stance toward {tag}", { tag: alliance.tag })}>
                            {Object.entries(stanceLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                          </select>
                        </td>
                        <td className="intel-hide-mobile" style={{ textAlign: "start", whiteSpace: "normal" }}>
                          <input form={`relation-${alliance.id}`} name="summary" maxLength={500} defaultValue={relation?.summary ?? ""} aria-label={t("Summary for {tag}", { tag: alliance.tag })} style={{ width: "100%" }} />
                        </td>
                        <td>
                          <form id={`relation-${alliance.id}`} onSubmit={submit((values) => ({ action: "set_relation", alliance_id: alliance.id, stance: values.stance, summary: values.summary || undefined }), t("Relationship saved."))}>
                            <button className="intel-button" disabled={busy}><Text>{"Save"}</Text></button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {desk.alliances.length === 0 && <p className="intel-empty"><Text>{"Track alliances on the Kingdom page to manage relationships."}</Text></p>}
            </div>
          </section>
          <div className="intel-split">
            <section className="intel-section">
              <div className="intel-section-head"><div><h2><Text>{"Treaties and agreements"}</Text></h2></div></div>
              {desk.treaties.length === 0 ? <p className="intel-empty"><Text>{"No treaties recorded."}</Text></p> : (
                <ul className="intel-queue">{desk.treaties.map((treaty) => (
                  <li key={treaty.id}>
                    <div><h3>{treaty.title} <span className="intel-chip">{treaty.kind.toUpperCase()}</span></h3>
                      <p>{allianceName(treaty.alliance_id)}{treaty.starts_on && ` · ${day(treaty.starts_on, locale)}`}{treaty.ends_on && ` – ${day(treaty.ends_on, locale)}`}{treaty.terms && ` · ${treaty.terms}`}</p></div>
                    <select value={treaty.status} disabled={busy} aria-label={t("Treaty status")}
                      onChange={(event) => void act({ action: "treaty_status", id: treaty.id, status: event.target.value }, t("Treaty updated."))}>
                      {["proposed", "active", "expired", "ended", "violated", "rejected"].map((status) => <option key={status} value={status}>{{ proposed: t("Proposed"), active: t("Active"), expired: t("Expired"), ended: t("Ended"), violated: t("Violated"), rejected: t("Rejected") }[status]}</option>)}
                    </select>
                  </li>
                ))}</ul>
              )}
              <h2 style={{ fontSize: 13, fontWeight: 500, margin: "26px 0 12px" }}><Text>{"Stance history"}</Text></h2>
              <ul className="intel-feed">{desk.relation_history.slice(0, 15).map((row, index) => (
                <li key={index}><span aria-hidden="true">→</span><span>{allianceName(row.alliance_id)}<small>{`${stanceLabels[row.from_stance ?? ""] ?? "—"} → ${stanceLabels[row.to_stance]}`}{row.note && ` · ${row.note}`}{row.actor_name && ` · ${row.actor_name}`}</small></span><time>{day(row.created_at, locale)}</time></li>
              ))}</ul>
            </section>
            <aside className="intel-aside">
              <section>
                <h2><Text>{"Record a treaty"}</Text></h2>
                <form className="intel-form" onSubmit={submit((values) => ({ action: "add_treaty", ...values, terms: values.terms || undefined, starts_on: values.starts_on || null, ends_on: values.ends_on || null }), t("Treaty recorded."))}>
                  <label><Text>{"Alliance"}</Text><select name="alliance_id" required>{desk.alliances.map((row) => <option key={row.id} value={row.id}>[{row.tag}] {row.name}</option>)}</select></label>
                  <div className="intel-form-row">
                    <label><Text>{"Type"}</Text><select name="kind">{[["nap", t("NAP")], ["alliance", t("Alliance")], ["merger", t("Merger")], ["ceasefire", t("Ceasefire")], ["other", t("Other")]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                    <label><Text>{"Status"}</Text><select name="status"><option value="proposed">{t("Proposed")}</option><option value="active">{t("Active")}</option></select></label>
                  </div>
                  <label><Text>{"Title"}</Text><input name="title" required maxLength={120} /></label>
                  <div className="intel-form-row">
                    <label><Text>{"Starts"}</Text><input type="date" name="starts_on" /></label>
                    <label><Text>{"Ends"}</Text><input type="date" name="ends_on" /></label>
                  </div>
                  <label><Text>{"Terms"}</Text><textarea name="terms" maxLength={2000} /></label>
                  <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy || !desk.alliances.length}><Text>{"Record treaty"}</Text></button></div>
                </form>
              </section>
              <section>
                <h2><Text>{"Diplomatic contacts"}</Text></h2>
                <ul className="intel-feed">{desk.contacts.map((contact) => (
                  <li key={contact.id}><span aria-hidden="true">@</span><span>{contact.in_game_name}<small>{allianceName(contact.alliance_id)}{contact.role && ` · ${contact.role}`}{contact.notes && ` · ${contact.notes}`}</small></span>
                    <button type="button" className="intel-button" style={{ minHeight: 28 }} disabled={busy} aria-label={t("Remove {name}", { name: contact.in_game_name })} onClick={() => void act({ action: "remove_contact", id: contact.id }, t("Contact removed."))}>×</button></li>
                ))}</ul>
                <form className="intel-form" style={{ marginTop: 12 }} onSubmit={submit((values) => ({ action: "add_contact", ...values, role: values.role || undefined, notes: values.notes || undefined }), t("Contact added."))}>
                  <div className="intel-form-row">
                    <label><Text>{"Alliance"}</Text><select name="alliance_id" required>{desk.alliances.map((row) => <option key={row.id} value={row.id}>[{row.tag}]</option>)}</select></label>
                    <label><Text>{"In-game name"}</Text><input name="in_game_name" required maxLength={60} /></label>
                  </div>
                  <label><Text>{"Role"}</Text><input name="role" maxLength={60} /></label>
                  <div className="intel-form-actions"><button className="intel-button" disabled={busy || !desk.alliances.length}><Text>{"Add contact"}</Text></button></div>
                </form>
              </section>
            </aside>
          </div>
        </>
      )}

      {tab === "notes" && (
        <div className="intel-split">
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Leadership notes"}</Text></h2><p><Text>{"Recruitment plans, merger discussions, operations, and event coordination."}</Text></p></div></div>
            {desk.notes.length === 0 ? <p className="intel-empty"><Text>{"No notes yet."}</Text></p> : (
              <ol className="intel-timeline">{desk.notes.map((note) => (
                <li key={note.id}>
                  <time>{day(note.created_at, locale)}</time>
                  <div><h3>{note.title}</h3><p style={{ whiteSpace: "pre-wrap" }}>{note.body}</p>
                    <span className="intel-source"><span>{note.category}</span>{note.alliance_id && <span>{allianceName(note.alliance_id)}</span>}{note.author && <span>{note.author}</span>}</span>
                    <button type="button" className="intel-button" style={{ marginInlineStart: 10 }} disabled={busy} onClick={() => void act({ action: "archive_note", id: note.id }, t("Note archived."))}><Text>{"Archive"}</Text></button>
                  </div>
                </li>
              ))}</ol>
            )}
          </section>
          <aside className="intel-aside"><section>
            <h2><Text>{"Write a note"}</Text></h2>
            <form className="intel-form" onSubmit={submit((values) => ({ action: "add_note", ...values, alliance_id: values.alliance_id || null }), t("Note saved."))}>
              <div className="intel-form-row">
                <label><Text>{"Category"}</Text><select name="category">{[["recruitment", t("Recruitment")], ["merger", t("Merger")], ["diplomacy", t("Diplomacy")], ["operations", t("Operations")], ["event", t("Event")]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label><Text>{"Alliance"}</Text><select name="alliance_id" defaultValue=""><option value="">{t("None")}</option>{desk.alliances.map((row) => <option key={row.id} value={row.id}>[{row.tag}]</option>)}</select></label>
              </div>
              <label><Text>{"Title"}</Text><input name="title" required maxLength={120} /></label>
              <label><Text>{"Note"}</Text><textarea name="body" required maxLength={4000} /></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Save note"}</Text></button></div>
            </form>
          </section></aside>
        </div>
      )}

      {tab === "links" && (
        <div className="intel-split">
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Suggested links"}</Text></h2><p><Text>{"Matched by the player ID a member submitted or by an exact in-game name. Confirm each one; nothing links automatically."}</Text></p></div></div>
            {desk.link_candidates.length === 0 ? <p className="intel-empty"><Text>{"No suggestions right now."}</Text></p> : (
              <ul className="intel-queue">{desk.link_candidates.map((row) => (
                <li key={`${row.user_id}-${row.player_id}`}>
                  <div><h3>{row.site_name} → {row.player_name}</h3><p>{row.matched_by === "game_id" ? t("Matched by submitted player ID {uid}", { uid: row.uid }) : t("Matched by in-game name; check the character ID {uid}", { uid: row.uid })}</p></div>
                  <button type="button" className="intel-button" disabled={busy} onClick={() => void act({ action: "link_player", user_id: row.user_id, player_id: row.player_id }, t("Account linked."))}><Text>{"Confirm link"}</Text></button>
                </li>
              ))}</ul>
            )}
            <div className="intel-section-head" style={{ marginTop: 30 }}><div><h2><Text>{"Linked accounts"}</Text></h2></div></div>
            <ul className="intel-queue">{desk.links.map((row) => (
              <li key={row.user_id}>
                <div><h3>{row.site_name} → {row.player_name}</h3><p><Text values={{ uid: row.uid }}>{"Character ID {uid}"}</Text></p></div>
                <button type="button" className="intel-button is-danger" disabled={busy} onClick={() => void act({ action: "unlink_player", user_id: row.user_id }, t("Link removed."))}><Text>{"Unlink"}</Text></button>
              </li>
            ))}</ul>
          </section>
          <aside className="intel-aside"><section>
            <h2><Text>{"Link manually"}</Text></h2>
            <form className="intel-form" onSubmit={submit((values) => ({ action: "link_player", ...values }), t("Account linked."))}>
              <label><Text>{"Site account"}</Text><select name="user_id" required>{desk.unlinked_members.map((row) => <option key={row.user_id} value={row.user_id}>{row.site_name}</option>)}</select></label>
              <label><Text>{"In-game character"}</Text><select name="player_id" required>{desk.roster.map((row) => <option key={row.id} value={row.id}>{`${row.name} · ${row.uid}`}</option>)}</select></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy || !desk.unlinked_members.length}><Text>{"Link"}</Text></button></div>
            </form>
            <p className="intel-note" style={{ marginTop: 12 }}><Text>{"A linked member can see their own contributions and progression. Other members only see the shared roster."}</Text></p>
          </section></aside>
        </div>
      )}

      {tab === "settings" && (
        <div className="intel-split">
          <section className="intel-section">
            <div className="intel-section-head"><div><h2><Text>{"Alliance capacity"}</Text></h2><p><Text>{"The provider does not report maximum membership, so leadership sets it here."}</Text></p></div></div>
            <form className="intel-form" style={{ maxWidth: 320 }} onSubmit={submit((values) => ({ action: "set_capacity", capacity: values.capacity ? Number(values.capacity) : null }), t("Capacity saved."))}>
              <label><Text>{"Maximum members"}</Text><input name="capacity" type="number" min={1} max={500} defaultValue={desk.capacity ?? ""} /></label>
              <div className="intel-form-actions"><button className="intel-button is-primary" disabled={busy}><Text>{"Save"}</Text></button></div>
            </form>
            <div className="intel-section-head" style={{ marginTop: 34 }}><div><h2><Text>{"Public kingdom standings"}</Text></h2>
              <p><Text>{"When on, signed-out visitors can see the tracked alliance standings and public kingdom records. Rosters, member data, diplomacy, and leadership records always stay private."}</Text></p></div></div>
            <label className="portal-regent-select">
              <input type="checkbox" checked={desk.kingdom_public} disabled={busy} onChange={(event) => void act({ action: "set_publication", kingdom_public: event.target.checked }, t("Publication setting saved."))} />
              <Text>{"Publish kingdom standings"}</Text>
            </label>
          </section>
        </div>
      )}
    </>
  );
}
