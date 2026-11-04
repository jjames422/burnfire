"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { browserSupportsWebAuthnAutofill, WebAuthnAbortService, startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { api, apiPost } from "@/lib/api/client";
import type { ProfileRow, SessionInfo } from "@/lib/api/types";
import { ProfileSetupModal } from "./ProfileSetupModal";

interface AuthGateProps {
  children: ReactNode;
  redirectPath?: string;
  featureName?: string;
  allowIncompleteProfile?: boolean;
  signup?: boolean;
}

/**
 * Gates children behind a signed-in session, then
 * behind a completed `profiles` row. First-time sign-ins see
 * ProfileSetupModal; everyone after that skips straight to `children`.
 */
export function AuthGate({
  children,
  allowIncompleteProfile = false,
  redirectPath,
  featureName,
  signup = false,
}: AuthGateProps) {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"code" | "link">("code");
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<SessionInfo>("/api/auth/session").then(({ data }) => {
      if (cancelled) return;
      setUserId(data?.user?.id ?? null);
      setProfile(data?.profile ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSendCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const { error: sendError } = await apiPost(method === "link" ? "/api/auth/request-link" : "/api/auth/request-code", {
      email: email.trim(),
      returnTo: redirectPath ?? `${window.location.pathname}${window.location.search}`,
    });
    setSending(false);
    if (sendError) setError(sendError);
    else setSent(true);
  }

  useEffect(() => {
    if (loading || userId || sent) return;
    let active = true;
    async function offerSavedPasskey() {
      try {
        const available = await browserSupportsWebAuthnAutofill();
        if (!active) return;
        setPasskeySupported(available);
        if (!available) return;
        const options = await apiPost<PublicKeyCredentialRequestOptionsJSON>("/api/auth/passkeys/authenticate/options", {});
        if (options.error || !options.data) throw new Error(options.error ?? "Passkey sign-in is unavailable.");
        if (!active) return;
        const response = await startAuthentication({ optionsJSON: options.data, useBrowserAutofill: true });
        if (!active) return;
        const verified = await apiPost("/api/auth/passkeys/authenticate/verify", { response });
        if (verified.error) throw new Error(verified.error);
        const session = await api<SessionInfo>("/api/auth/session");
        if (!session.data?.user) throw new Error(session.error ?? "Sign-in could not be completed.");
        if (!active) return;
        setUserId(session.data.user.id);
        setProfile(session.data.profile);
      } catch (failure) {
        if (!active) return;
        if (failure instanceof Error && (failure.name === "AbortError" || failure.name === "NotAllowedError")) return;
        setError(failure instanceof Error ? failure.message : "Saved-passkey sign-in is unavailable. Use email to continue.");
      }
    }
    void offerSavedPasskey();
    return () => { active = false; WebAuthnAbortService.cancelCeremony(); };
  }, [loading, userId, sent]);

  async function handleVerifyCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const { data, error: verifyError } = await apiPost<{
      user: { id: string };
      profile: ProfileRow | null;
    }>("/api/auth/verify", { email: email.trim(), code: code.trim() });
    setSending(false);
    if (verifyError || !data) {
      setError(verifyError ?? "Sign-in failed.");
      return;
    }
    setUserId(data.user.id);
    setProfile(data.profile);
  }

  if (loading) {
    return <div className="auth-loading"><span /><Text>{"Igniting secure connection…"}</Text></div>;
  }

  if (!userId) {
    return (
      <div className="auth-card auth-card-premium">
        <style>{"\n          .auth-card-premium .auth-passkey { display:flex; align-items:center; justify-content:center; gap:10px; height:52px; border:1px solid #625043; color:#fff1dc; background:linear-gradient(120deg,#302522,#1a171b); box-shadow:inset 0 1px 0 #ffffff0d,0 8px 25px #0003; }\n          .auth-card-premium .auth-passkey span { font-size:22px; color:#ffb66c; }\n          .auth-card-premium .auth-method-hint { margin:10px 0 22px; text-align:center; font-size:11px; }\n          .auth-method-divider { display:flex; align-items:center; gap:12px; margin:22px 0; color:#8c8182; font-size:10px; letter-spacing:.08em; }\n          .auth-method-divider::before,.auth-method-divider::after { content:\"\"; flex:1; height:1px; background:#393037; }\n          .auth-method-tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; margin-bottom:22px; border:1px solid #382d32; border-radius:12px; background:#100e12; }\n          .auth-method-tab { padding:11px 8px; border:1px solid transparent; border-radius:8px; color:#9b8e8d; font-size:11px; transition:background .2s,color .2s; }\n          .auth-method-tab.is-active { color:#ffe7c0; border-color:#62402c; background:linear-gradient(120deg,#47291d,#2e2020); box-shadow:0 2px 6px #0003; }\n          .auth-method-tab:focus-visible,.auth-resend:focus-visible { outline:2px solid #ffb21c; outline-offset:3px; }\n          .auth-card-premium .auth-resend { display:block; margin:16px auto 0; color:#bb9b83; font-size:11px; line-height:1.6; text-align:center; }\n          .auth-card-premium .auth-sent { margin-bottom:20px; }\n          .auth-card-premium button:disabled { cursor:not-allowed; }\n        "}</style>
        <div className="auth-mascot"><img src="/images/burnfire/logo.png" alt={t("BurnFire mascot")} /></div>
        <span className="eyebrow"><Text>{"Your alliance. Your secure access."}</Text></span>
        <h2>{signup ? <Text>{"Create account"}</Text> : <Text>{"Enter the survivor network"}</Text>}</h2>
        <p className="auth-intro">{signup ? <Text>{"Verify your email to create an account. Already registered? Use the same email to sign in."}</Text> : <>{featureName ? t("Sign in to access {featureName}. ", { featureName: t(featureName) }) : ""}<Text>{"Your place by the fire, without another password. Use a passkey, an email link, or a one-time code."}</Text></>}</p>
        {!sent && (
          <>
            <p className="auth-method-hint auth-intro">{passkeySupported ? t("Already saved a passkey for this website? Select the email field and choose your saved account to use Touch ID, Face ID, or your device unlock. No saved passkey? Use email below first.") : t("Sign in with email below. You can set up device sign-in after signing in.")} {" "}<Text>{"First visit? Add a passkey in Sign-in & security after signing in by email."}</Text></p>
            <div className="auth-method-tabs" role="group" aria-label={t("Email sign-in method")}>
              <button type="button" className={`auth-method-tab ${method === "code" ? "is-active" : ""}`} aria-pressed={method === "code"} disabled={sending} onClick={() => { setMethod("code"); setError(null); }}><Text>{"One-time code"}</Text></button>
              <button type="button" className={`auth-method-tab ${method === "link" ? "is-active" : ""}`} aria-pressed={method === "link"} disabled={sending} onClick={() => { setMethod("link"); setError(null); }}><Text>{"Email me a link"}</Text></button>
            </div>
          </>
        )}
        {sent && method === "link" ? (
          <div className="auth-link-sent">
            <div className="auth-sent" role="status"><span aria-hidden="true">✦</span><strong><Text>{"Your invitation to the fire"}</Text></strong><p><Text values={{ value1: String(email.trim() ?? "") }}>{"A secure sign-in link is on its way to {value1}. It expires in 10 minutes. Open it and choose Continue."}</Text></p></div>
            <button type="button" className="auth-resend" disabled={sending} onClick={() => { setSent(false); setError(null); }}><Text>{"Use another method or resend"}</Text></button>
          </div>
        ) : sent ? (
          <form onSubmit={handleVerifyCode}>
            <div className="auth-sent"><span>✦</span><strong><Text>{"Check your email"}</Text></strong><p><Text values={{ value1: String(email.trim() ?? "") }}>{"Enter the 6-digit code we sent to {value1}."}</Text></p></div>
            <label className="auth-label" htmlFor="auth-code"><Text>{"Sign-in code"}</Text></label>
            <input
              id="auth-code"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="auth-input"
              autoFocus
              autoComplete="one-time-code"
              disabled={sending}
            />
            <button type="submit" disabled={sending} className="auth-submit">
              {sending ? t("Verifying…") : t("Enter the network")}
            </button>
            <button
              type="button"
              className="auth-resend"
              disabled={sending}
              onClick={() => { setSent(false); setCode(""); setError(null); }}
            >
              <Text>{"Use a different email or resend the code"}</Text></button>
          </form>
        ) : (
          <form onSubmit={handleSendCode}>
            <label className="auth-label" htmlFor="auth-email"><Text>{"Email address"}</Text></label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder={t("you@example.com")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="auth-input"
              autoComplete="username webauthn"
              disabled={sending}
            />
            <button type="submit" disabled={sending} className="auth-submit">
              {sending ? t("Sending securely…") : method === "link" ? t("Send my sign-in link") : t("Continue with email code")}
            </button>
          </form>
        )}
        {error && <p className="auth-error" role="alert">{t(error)}</p>}
        <small className="auth-host"><Text>{"Hosted by BurnFire Alliance · An unofficial Last Asylum: Plague community"}</Text></small>
      </div>
    );
  }

  if (!profile && !allowIncompleteProfile) {
    return <ProfileSetupModal onComplete={setProfile} />;
  }

  return <>{children}</>;
}
