"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { api } from "@/lib/api/client";
import { RECOVERY_ACTIONS, isRecoveryAction, type RecoveryAction, type UserRecoveryData } from "@/lib/command/recovery";

export function UserRecovery({ userId, onClose, onSaved }: {
  userId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [data, setData] = useState<UserRecoveryData | null>(null);
  const [action, setAction] = useState<RecoveryAction>("academy_reset");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const endpoint = `/api/command/members/${userId}/recovery`;

  useEffect(() => {
    let active = true;
    heading.current?.focus();
    api<UserRecoveryData>(endpoint).then((result) => {
      if (!active) return;
      if (result.error || !result.data) setError(result.error ?? "User recovery details could not be loaded.");
      else setData(result.data);
    });
    return () => { active = false; };
  }, [endpoint]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await api<{ saved: boolean; signed_out: boolean }>(endpoint, {
      method: "POST",
      body: JSON.stringify({ action, reason: reason.trim(), confirmed, followup_ids: selected }),
    });
    if (result.error || !result.data) {
      setError(result.error ?? "The reset could not be completed.");
      setBusy(false);
      return;
    }
    if (result.data.signed_out) {
      window.location.assign("/portal/members");
      return;
    }
    setMessage(`${RECOVERY_ACTIONS[action].label} completed and recorded.`);
    setConfirmed(false);
    setReason("");
    setSelected([]);
    const refreshed = await api<UserRecoveryData>(endpoint);
    if (refreshed.error || !refreshed.data) {
      setData(null);
      setError(refreshed.error ?? "Reset completed, but details could not be refreshed. Close and reopen this panel.");
    } else setData(refreshed.data);
    await onSaved();
    setBusy(false);
  }

  const unavailable = data && ((action === "academy_reset" || action === "reset_identity") && !data.user.enrolled);
  return <section className="portal-panel portal-recovery" aria-labelledby="recovery-heading">
    <div className="portal-section-heading"><h2 id="recovery-heading" ref={heading} tabIndex={-1}>Account support & resets{data ? `: ${data.user.in_game_name}` : ""}</h2><button className="portal-secondary" disabled={busy} onClick={onClose}>Close support</button></div>
    {error && <p className="portal-alert" role="alert">{error}</p>}
    {message && <p className="portal-notice" role="status">{message}</p>}
    {!data && !error && <p role="status">Loading account details...</p>}
    {data && <>
      <p className="portal-detail">{data.user.email}</p>
      <p>{data.user.game_rank?.toUpperCase() ?? "No alliance rank"} · Identity: {data.user.identity_status ?? "Not enrolled"} · {data.user.sessions} active sessions · {data.user.passkeys} passkeys</p>
      <p>{data.user.quiz_attempts} quiz attempts · {data.user.acknowledgments} acknowledgments · {data.followups.length} open issues</p>
      <form onSubmit={submit}>
        <label htmlFor="recovery-action">Support action</label>
        <select id="recovery-action" disabled={busy} value={action} onChange={(event) => {
          if (isRecoveryAction(event.target.value)) {
            setAction(event.target.value);
            setConfirmed(false);
            setSelected([]);
            setError(null);
            setMessage(null);
          }
        }}>{Object.entries(RECOVERY_ACTIONS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
        <p id="recovery-effect" className="portal-alert">{RECOVERY_ACTIONS[action].description}</p>
        {unavailable && <p role="status">This account is not enrolled in the academy. This reset is not available.</p>}
        {action === "resolve_followups" && <fieldset disabled={busy}>
          <legend>Select issues to resolve</legend>
          {data.followups.length === 0 ? <p>No open follow-up issues for this user.</p> : data.followups.map((issue) => <label className="portal-recovery-issue" key={issue.id}>
            <input type="checkbox" checked={selected.includes(issue.id)} onChange={(event) => {
              setSelected((current) => event.target.checked ? [...current, issue.id] : current.filter((id) => id !== issue.id));
              setConfirmed(false);
            }} />
            <span><strong>{issue.training_title ?? "Officer follow-up"}</strong><br />{issue.reason} ({issue.status.replaceAll("_", " ")})</span>
          </label>)}
        </fieldset>}
        <label htmlFor="recovery-reason">Reason for this action (recorded in audit history)</label>
        <textarea id="recovery-reason" required minLength={3} maxLength={1000} rows={3} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} />
        <label className="portal-recovery-issue"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm: {RECOVERY_ACTIONS[action].label} for {data.user.in_game_name} ({data.user.email}). I understand the effect above.</span></label>
        <button className="portal-primary" disabled={busy || !confirmed || reason.trim().length < 3 || Boolean(unavailable) || (action === "resolve_followups" && (selected.length === 0 || selected.length > 100))}>{busy ? "Applying..." : "Confirm support action"}</button>
      </form>
      <h3>Recent support history</h3>
      {data.history.length === 0 ? <p>No support actions recorded yet.</p> : <ul>{data.history.map((entry) => <li key={entry.id}>
        <strong>{RECOVERY_ACTIONS[entry.action].label}</strong> · {entry.actor_name ?? "Former administrator"} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time><p>{entry.reason}</p>
      </li>)}</ul>}
    </>}
  </section>;
}
