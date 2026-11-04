"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration, type PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { api, apiPost } from "@/lib/api/client";

type Passkey = { id: string; name: string; created_at: string; last_used_at: string | null };

export function SignInSettings() {
  const { t, locale } = useTranslation();
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
    let active = true;
    if (browserSupportsWebAuthn()) {
      platformAuthenticatorIsAvailable().then((available) => {
        if (active) setSupported(available);
      }).catch(() => {
        if (active) setError(t("Device sign-in availability could not be checked. Email sign-in remains available."));
      });
    }
    void load();
    return () => { active = false; };
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
      setMessage(t("Your passkey is ready. Next time, select the email field and choose your saved account."));
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "NotAllowedError" ? failure.message : "Passkey setup was cancelled. You can try again or keep using email.");
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!removeId) return;
    setBusy(true); setMessage(null);
    const result = await api("/api/auth/passkeys", { method: "DELETE", body: JSON.stringify({ id: removeId }) });
    if (result.error) setError(result.error);
    else { setRemoveId(null); await load(); setMessage(t("Passkey removed. Email sign-in remains available.")); }
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
      <header className="portal-page-heading"><span className="portal-kicker"><Text>{"YOUR ACCOUNT. YOUR WAY IN."}</Text></span><h1><Text>{"Less friction."}</Text><br /><em><Text>{"More protection."}</Text></em></h1><p><Text>{"One account for your training, chat, and leadership tools. Choose how you sign in."}</Text></p></header>
      {error && <p className="portal-alert" role="alert">{t(error)}</p>}
      {message && <p className="portal-notice" role="status">{t(message)}</p>}
      <section className="portal-panel portal-security-card">
        <h2><Text>{"Passkeys"}</Text></h2><p><Text>{"Save a passkey on this device using Face ID, Touch ID, Windows Hello, or your device PIN. No USB security key or separate authenticator app is required. Your biometric data stays on your device."}</Text></p>
        <p><Text>{"For your protection, adding a passkey requires signing in within the last 10 minutes. If asked, sign out below and sign back in first."}</Text></p>
        <div className="portal-passkey-form"><label htmlFor="passkey-name"><Text>{"Device nickname"}</Text></label><input id="passkey-name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("e.g. My phone")} /><button disabled={!supported || busy} onClick={() => void register()} className="portal-primary">{busy ? t("Working...") : t("Add a passkey")}</button></div>
        {!supported && <p className="portal-alert"><Text>{"Built-in device sign-in is unavailable here. Enable your device screen lock or Windows Hello and use a supported browser over HTTPS (or localhost for development). You can keep signing in by email without any extra hardware."}</Text></p>}
        <ul>{keys.map((key) => <li key={key.id}><div><strong>{key.name}</strong><p><Text>{"Added"}</Text>{" "}{new Date(key.created_at).toLocaleDateString(locale)}{key.last_used_at ? t(" / Last used {value1}", { value1: new Date(key.last_used_at).toLocaleDateString(locale) }) : ""}</p></div><button disabled={busy} onClick={() => setRemoveId(key.id)} className="portal-secondary"><Text>{"Remove"}</Text></button></li>)}</ul>
        {keys.length === 0 && <p><Text>{"No passkeys yet. Email sign-in is still available."}</Text></p>}
        {removeId && <div className="portal-confirm"><p><Text>{"Remove this passkey? You can still sign in using email or another registered passkey."}</Text></p><div className="portal-actions"><button disabled={busy} onClick={() => void remove()} className="portal-primary"><Text>{"Confirm removal"}</Text></button><button disabled={busy} onClick={() => setRemoveId(null)} className="portal-secondary"><Text>{"Cancel"}</Text></button></div></div>}
      </section>
      <section className="portal-panel portal-security-card" style={{ marginTop: 20 }}>
        <h2><Text>{"Email sign-in"}</Text></h2><p><Text>{"Choose an emailed sign-in link or a six-digit code at the sign-in screen. Both expire after 10 minutes. Email remains your recovery option, so protect your mailbox with its own strong authentication."}</Text></p><p><Text>{"Sessions last up to 30 days on each browser. Never stay signed in on a shared device."}</Text></p>
        <div className="portal-actions"><button disabled={busy} onClick={() => void signOut()} className="portal-secondary"><Text>{"Sign out of this browser"}</Text></button></div>
      </section>
    </>
  );
}
