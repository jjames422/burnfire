"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";
import { ProfileSetupModal } from "./ProfileSetupModal";

interface AuthGateProps {
  children: ReactNode;
  redirectPath?: string;
  featureName?: string;
}

/**
 * Gates children behind a Supabase magic-link session, then behind a
 * completed `profiles` row. First-time sign-ins see ProfileSetupModal;
 * everyone after that skips straight to `children`.
 */
export function AuthGate({
  children,
  redirectPath = "/chat",
  featureName = "Chat",
}: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const client = supabase;

    async function loadProfile(userId: string) {
      const { data } = await client
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!cancelled) {
        setProfile(data ?? null);
        setLoading(false);
      }
    }

    async function init() {
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      else setLoading(false);
    }

    init();

    const { data: listener } = client.auth.onAuthStateChange(
      (_event, newSession) => {
        if (cancelled) return;
        setSession(newSession);
        if (newSession) {
          setLoading(true);
          loadProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
      },
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSendMagicLink(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSending(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${redirectPath}` },
    });

    setSending(false);
    if (otpError) setError(otpError.message);
    else setSent(true);
  }

  if (!isSupabaseConfigured) {
    return (
      <p className="border border-border bg-surface p-4 text-sm text-text-secondary">
        {featureName} isn&apos;t configured yet — copy .env.local.example to
        .env.local with a Supabase project&apos;s URL and anon key to enable it.
      </p>
    );
  }

  if (loading) {
    return <div className="auth-loading"><span />Igniting secure connection…</div>;
  }

  if (!session) {
    return (
      <div className="auth-card">
        <div className="auth-mascot"><img src="/images/burnfire/logo.png" alt="BurnFire mascot" /></div>
        <span className="eyebrow">Kingdom #324 community access</span>
        <h2>Enter the survivor network</h2>
        <p className="auth-intro">One secure link. No password to remember. Your in-game identity follows you everywhere on the site.</p>
        {sent ? (
          <div className="auth-sent"><span>✦</span><strong>Check your email</strong><p>Your secure link will return you directly to the community chat.</p></div>
        ) : (
          <form onSubmit={handleSendMagicLink}>
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
            <button
              type="submit"
              disabled={sending}
              className="auth-submit"
            >
              {sending ? "Sending secure link…" : "Continue with magic link"}
            </button>
          </form>
        )}
        <small className="auth-host">Hosted by BurnFire Alliance · An unofficial Last Asylum: Plague community</small>
      </div>
    );
  }

  if (!profile) {
    return (
      <ProfileSetupModal userId={session.user.id} onComplete={setProfile} />
    );
  }

  return <>{children}</>;
}
