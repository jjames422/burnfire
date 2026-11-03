"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { api, apiPost } from "@/lib/api/client";

export function InvitationRedeemer({ token }: { token: string }) {
  const router = useRouter();
  const [inGameName, setInGameName] = useState("");
  const [validating, setValidating] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ valid: true }>(`/api/academy/invitations/${encodeURIComponent(token)}`)
      .then(({ error: requestError }) => {
        if (!active) return;
        if (requestError) setError(requestError);
        setValidating(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: redeemError } = await apiPost(
      `/api/academy/invitations/${encodeURIComponent(token)}`,
      { in_game_name: inGameName.trim() },
    );
    setSubmitting(false);
    if (redeemError) {
      setError(redeemError);
      return;
    }
    router.replace("/academy");
  }

  return (
    <section className="mx-auto w-full max-w-xl border border-border bg-surface p-6 sm:p-8">
      <span className="eyebrow">BF2 Recruit Academy</span>
      <h1 className="mt-2 font-display text-3xl font-semibold">Redeem your invitation</h1>
      <p className="mt-3 text-sm text-text-secondary">
        This invitation is tied to the email address you used to sign in. Onboarding is available
        on the website; optional chat participation is not required.
      </p>
      {validating ? (
        <p className="mt-6 text-sm text-text-secondary">Checking invitation…</p>
      ) : error ? (
        <p role="alert" className="mt-6 border border-warning/40 bg-bg p-3 text-sm text-warning">
          {error}
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm">
            <span className="mb-2 block text-text-secondary">Exact in-game player name</span>
            <input
              required
              minLength={1}
              maxLength={40}
              value={inGameName}
              onChange={(event) => setInGameName(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-text-primary"
              autoComplete="nickname"
            />
          </label>
          {error && <p role="alert" className="text-sm text-warning">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="interactive-lift border border-accent bg-accent px-5 py-3 font-display font-semibold disabled:opacity-50"
          >
            {submitting ? "Redeeming…" : "Join the academy"}
          </button>
        </form>
      )}
    </section>
  );
}
