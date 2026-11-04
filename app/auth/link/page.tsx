"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState } from "react";
import { apiPost } from "@/lib/api/client";

export default function AuthLinkPage() {
  const { t, locale } = useTranslation();
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
        <span className="eyebrow"><Text>{"BurnFire · Secure access"}</Text></span>
        <h2><Text>{"Welcome back to the fire."}</Text></h2>
        <p className="auth-intro"><Text>{"You're one step away. Confirm below to use your one-time sign-in link. It expires 10 minutes after you requested it."}</Text></p>
        {ready && !token && <p className="auth-error" role="alert"><Text>{"This link is missing its sign-in token. Open the complete link from your email, or request a new one."}</Text></p>}
        {error && <p className="auth-error" role="alert">{t(error)}</p>}
        <button type="button" className="auth-submit" disabled={!ready || !token || busy} onClick={continueSignIn}>
          {busy ? t("Opening your secure session…") : t("Continue to BurnFire")}
        </button>
        <a className="auth-resend" href="/portal"><Text>{"Back to sign-in options"}</Text></a>
        <small className="auth-host"><Text>{"Only continue if you requested this sign-in email."}</Text></small>
      </section>
    </main>
  );
}
