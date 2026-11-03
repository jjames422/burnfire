"use client";

import { useEffect, useState } from "react";
import { apiPost } from "@/lib/api/client";

export default function AuthLinkPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const value = fragment.get("token");
    if (value) {
      setToken(value);
      // Fragments never reach HTTP access logs; remove it from visible history, too.
      window.history.replaceState(null, "", window.location.pathname);
    }
    setReady(true);
  }, []);

  async function continueSignIn() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<{ returnTo: string }>("/api/auth/consume-link", { token });
    if (result.error || !result.data) {
      setError(result.error ?? "This sign-in link could not be used. Request a new one.");
      setBusy(false);
      return;
    }
    setToken(null);
    window.location.replace(result.data.returnTo);
  }

  return (
    <main className="auth-link-page">
      <section className="auth-card auth-card-premium">
        <span className="eyebrow">BurnFire · Secure access</span>
        <h2>Welcome back to the fire.</h2>
        <p className="auth-intro">You&apos;re one step away. Confirm below to use your one-time sign-in link. It expires 10 minutes after you requested it.</p>
        {ready && !token && <p className="auth-error" role="alert">This link is missing its sign-in token. Open the complete link from your email, or request a new one.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="button" className="auth-submit" disabled={!ready || !token || busy} onClick={continueSignIn}>
          {busy ? "Opening your secure session…" : "Continue to BurnFire"}
        </button>
        <a className="auth-resend" href="/portal">Back to sign-in options</a>
        <small className="auth-host">Only continue if you requested this sign-in email.</small>
      </section>
    </main>
  );
}
