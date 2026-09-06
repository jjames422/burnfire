"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/types";
import { ProfileSetupModal } from "./ProfileSetupModal";

interface AuthGateProps {
  alliance: string;
  children: ReactNode;
  redirectPath?: string;
  featureName?: string;
}

/**
 * Gates children behind a Supabase magic-link session, then behind a
 * completed `profiles` row. First-time sign-ins see ProfileSetupModal;
 * everyone after that skips straight to `children`.
 */
export function AuthGate({ alliance, children, redirectPath = "/chat", featureName = "Chat" }: AuthGateProps) {
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
      const { data } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
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

    const { data: listener } = client.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession) {
        setLoading(true);
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

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
        {featureName} isn&apos;t configured yet — copy .env.local.example to .env.local with a Supabase
        project&apos;s URL and anon key to enable it.
      </p>
    );
  }

  if (loading) {
    return <p className="text-text-secondary">Loading…</p>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-sm border border-border bg-surface p-6">
        <h2 className="mb-4 font-display text-xl font-semibold text-text-primary">Sign in</h2>
        {sent ? (
          <p className="text-sm text-text-secondary">
            Check your email for a sign-in link — it&apos;ll bring you right back here.
          </p>
        ) : (
          <form onSubmit={handleSendMagicLink}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
            />
            {error && <p className="mb-3 text-sm text-warning">{error}</p>}
            <button
              type="submit"
              disabled={sending}
              className="interactive-lift w-full border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!profile) {
    return (
      <ProfileSetupModal alliance={alliance} userId={session.user.id} onComplete={setProfile} />
    );
  }

  return <>{children}</>;
}
