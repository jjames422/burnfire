"use client";

import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";
import type { ProfileRow, SessionInfo } from "@/lib/api/types";
import { ProfileSetupModal } from "./ProfileSetupModal";

interface AuthGateProps {
  children: ReactNode;
  redirectPath?: string;
  featureName?: string;
}

/**
 * Gates children behind a signed-in session (email + 6-digit code), then
 * behind a completed `profiles` row. First-time sign-ins see
 * ProfileSetupModal; everyone after that skips straight to `children`.
 */
export function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const { error: sendError } = await apiPost("/api/auth/request-code", {
      email: email.trim(),
    });
    setSending(false);
    if (sendError) setError(sendError);
    else setSent(true);
  }

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
    return <div className="auth-loading"><span />Igniting secure connection…</div>;
  }

  if (!userId) {
    return (
      <div className="auth-card">
        <div className="auth-mascot"><img src="/images/burnfire/logo.png" alt="BurnFire mascot" /></div>
        <span className="eyebrow">Kingdom #324 community access</span>
        <h2>Enter the survivor network</h2>
        <p className="auth-intro">One secure code, sent to your email. No password to remember. Your in-game identity follows you everywhere on the site.</p>
        {sent ? (
          <form onSubmit={handleVerifyCode}>
            <div className="auth-sent"><span>✦</span><strong>Check your email</strong><p>Enter the 6-digit code we sent to {email.trim()}.</p></div>
            <label className="auth-label">Sign-in code</label>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="auth-input"
              autoFocus
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={sending} className="auth-submit">
              {sending ? "Verifying…" : "Enter the network"}
            </button>
            <button
              type="button"
              className="auth-resend"
              disabled={sending}
              onClick={() => { setSent(false); setCode(""); setError(null); }}
            >
              Use a different email or resend the code
            </button>
          </form>
        ) : (
          <form onSubmit={handleSendCode}>
            <label className="auth-label">Email address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="auth-input"
            />
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" disabled={sending} className="auth-submit">
              {sending ? "Sending secure code…" : "Continue with email code"}
            </button>
          </form>
        )}
        <small className="auth-host">Hosted by BurnFire Alliance · An unofficial Last Asylum: Plague community</small>
      </div>
    );
  }

  if (!profile) {
    return <ProfileSetupModal onComplete={setProfile} />;
  }

  return <>{children}</>;
}
