"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { CommentRow } from "@/lib/supabase/types";
import { TurnstileWidget } from "./TurnstileWidget";

interface CommentSectionProps {
  alliance: string;
  guideSlug: string;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const isTurnstileConfigured = Boolean(TURNSTILE_SITE_KEY);

export function CommentSection({ alliance, guideSlug }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState("");
  const [authorRank, setAuthorRank] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [widgetKey, setWidgetKey] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadComments() {
      const { data, error: fetchError } = await supabase!
        .from("comments")
        .select("*")
        .eq("alliance", alliance)
        .eq("guide_slug", guideSlug)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      else setComments(data ?? []);
      setLoading(false);
    }

    loadComments();
    return () => {
      cancelled = true;
    };
  }, [alliance, guideSlug]);

  function resetTurnstile() {
    setTurnstileToken(null);
    setWidgetKey((key) => key + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError(null);

    if (isTurnstileConfigured) {
      if (!turnstileToken) {
        setSubmitting(false);
        setError("Please complete the verification.");
        return;
      }

      const verifyResponse = await fetch("/api/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyResult = await verifyResponse.json();

      if (!verifyResult.success) {
        setSubmitting(false);
        setError("Verification failed — please try again.");
        resetTurnstile();
        return;
      }
    }

    const { data, error: insertError } = await supabase
      .from("comments")
      .insert({
        alliance,
        guide_slug: guideSlug,
        author_name: authorName.trim(),
        author_rank: authorRank.trim() || null,
        body: body.trim(),
      })
      .select()
      .single();

    setSubmitting(false);

    if (isTurnstileConfigured) resetTurnstile(); // tokens are single-use either way

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (data) {
      setComments((prev) => [data, ...prev]);
      setAuthorName("");
      setAuthorRank("");
      setBody("");
    }
  }

  return (
    <section className="mx-auto mt-4 w-full max-w-3xl px-6 pb-16">
      <h2 className="mb-6 font-display text-2xl font-semibold text-text-primary">Comments</h2>

      {!isSupabaseConfigured ? (
        <p className="border border-border bg-surface p-4 text-sm text-text-secondary">
          Comments aren&apos;t configured yet — copy .env.local.example to .env.local with a
          Supabase project&apos;s URL and anon key to enable them.
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="mb-10 border border-border bg-surface p-5">
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <input
                required
                maxLength={60}
                placeholder="Name"
                value={authorName}
                onChange={(event) => setAuthorName(event.target.value)}
                className="border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
              />
              <input
                maxLength={60}
                placeholder="Rank (optional)"
                value={authorRank}
                onChange={(event) => setAuthorRank(event.target.value)}
                className="border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
              />
            </div>
            <textarea
              required
              maxLength={2000}
              rows={4}
              placeholder="Add a comment..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
            />
            {isTurnstileConfigured && (
              <div className="mb-3">
                <TurnstileWidget
                  key={widgetKey}
                  siteKey={TURNSTILE_SITE_KEY!}
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}
            {error && <p className="mb-3 text-sm text-warning">{error}</p>}
            <button
              type="submit"
              disabled={submitting || (isTurnstileConfigured && !turnstileToken)}
              className="interactive-lift border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </form>

          {loading ? (
            <p className="text-text-secondary">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-text-secondary">No comments yet — be the first.</p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="border border-border bg-surface p-4">
                  <p className="mb-1 text-sm font-semibold text-text-primary">
                    {comment.author_name}
                    {comment.author_rank ? ` · ${comment.author_rank}` : ""}
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-text-secondary">{comment.body}</p>
                  <p className="mt-2 text-xs text-text-secondary/70">
                    {new Date(comment.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
