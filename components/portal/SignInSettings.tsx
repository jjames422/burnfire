"use client";

import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { api, apiPost } from "@/lib/api/client";

type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };

export function SignInSettings() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  async function load() {
    const result = await api<{ passkeys: Passkey[] }>("/api/auth/passkeys");
    if (result.error || !result.data) setError(result.error ?? "Passkeys could not be loaded.");
    else { setKeys(result.data.passkeys); setError(null); }
  }
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void load();
  }, []);

  async function register() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const options = await apiPost<PublicKeyCredentialCreationOptionsJSON>("/api/auth/passkeys/register/options", {});
      if (options.error || !options.data) throw new Error(options.error ?? "Could not start passkey setup.");
      const response = await startRegistration({ optionsJSON: options.data });
      const result = await apiPost("/api/auth/passkeys/register/verify", { response, name: name.trim() });
      if (result.error) throw new Error(result.error);
      setName("");
      await load();
      setMessage("Your passkey is ready. Next time, choose Sign in with a passkey.");
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "NotAllowedError" ? failure.message : "Passkey setup was cancelled. You can try again or keep using email.");
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!removeId) return;
    setBusy(true); setMessage(null);
    const result = await api("/api/auth/passkeys", { method: "DELETE", body: JSON.stringify({ id: removeId }) });
    if (result.error) setError(result.error);
    else { setRemoveId(null); await load(); setMessage("Passkey removed. Email sign-in remains available."); }
    setBusy(false);
  }
  async function signOut() {
    setBusy(true);
    const result = await apiPost("/api/auth/signout", {});
    if (result.error) { setError(result.error); setBusy(false); }
    else window.location.assign("/portal/security");
  }
  return (
    <>
      <header className="portal-page-heading"><span className="portal-kicker">YOUR ACCOUNT. YOUR WAY IN.</span><h1>Less friction.<br /><em>More protection.</em></h1><p>One account for your training, chat, and leadership tools. Choose how you sign in.</p></header>
      {error && <p className="portal-alert" role="alert">{error}</p>}
      {message && <p className="portal-notice" role="status">{message}</p>}
      <section className="portal-panel portal-security-card">
        <h2>Passkeys</h2><p>Use your face, fingerprint, security key, or device PIN. Your biometric data stays on your device. Add a backup passkey on a second device if possible.</p>
        <p>For your protection, adding a passkey requires signing in within the last 10 minutes. If asked, sign out below and sign back in first.</p>
        <div className="portal-passkey-form"><label htmlFor="passkey-name">Device nickname</label><input id="passkey-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. My phone" /><button disabled={!supported || busy} onClick={() => void register()} className="portal-primary">{busy ? "Working..." : "Add a passkey"}</button></div>
        {!supported && <p className="portal-alert">Passkeys need a supported browser and HTTPS, or localhost for development. They do not work on plain HTTP network addresses.</p>}
        <ul>{keys.map((key) => <li key={key.id}><div><strong>{key.name}</strong><p>Added {new Date(key.created_at).toLocaleDateString()}{key.last_used_at ? ` / Last used ${new Date(key.last_used_at).toLocaleDateString()}` : ""}</p></div><button disabled={busy} onClick={() => setRemoveId(key.id)} className="portal-secondary">Remove</button></li>)}</ul>
        {keys.length === 0 && <p>No passkeys yet. Email sign-in is still available.</p>}
        {removeId && <div className="portal-confirm"><p>Remove this passkey? You can still sign in using email or another registered passkey.</p><div className="portal-actions"><button disabled={busy} onClick={() => void remove()} className="portal-primary">Confirm removal</button><button disabled={busy} onClick={() => setRemoveId(null)} className="portal-secondary">Cancel</button></div></div>}
      </section>
      <section className="portal-panel portal-security-card" style={{ marginTop: 20 }}>
        <h2>Email sign-in</h2><p>Choose an emailed sign-in link or a six-digit code at the sign-in screen. Both expire after 10 minutes. Email remains your recovery option, so protect your mailbox with its own strong authentication.</p><p>Sessions last up to 30 days on each browser. Never stay signed in on a shared device.</p>
        <div className="portal-actions"><button disabled={busy} onClick={() => void signOut()} className="portal-secondary">Sign out of this browser</button></div>
      </section>
    </>
  );
}
