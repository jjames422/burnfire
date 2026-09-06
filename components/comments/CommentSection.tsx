"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { GuideCommentRow } from "@/lib/supabase/types";
import { AuthGate } from "@/components/auth/AuthGate";

interface CommentSectionProps {
  alliance: string;
  guideSlug: string;
}

export function CommentSection({ alliance, guideSlug }: CommentSectionProps) {
  const [comments, setComments] = useState<GuideCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadComments() {
      const { data, error: fetchError } = await supabase!.rpc(
        "get_guide_comments",
        {
          p_alliance: alliance,
          p_guide_slug: guideSlug,
        },
      );

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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    setSubmitting(true);
    setError(null);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setSubmitting(false);
      setError("Your session has expired. Sign in again to comment.");
      return;
    }

    const { error: insertError } = await supabase.from("comments").insert({
      alliance,
      guide_slug: guideSlug,
      author_id: authData.user.id,
      body: body.trim(),
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setBody("");
    const { data: refreshed, error: refreshError } = await supabase.rpc(
      "get_guide_comments",
      {
        p_alliance: alliance,
        p_guide_slug: guideSlug,
      },
    );
    if (refreshError) setError(refreshError.message);
    else setComments(refreshed ?? []);
  }

  return (
    <section className="mt-4 w-full pb-16">
      <h2 className="mb-6 font-display text-2xl font-semibold text-text-primary">
        Comments
      </h2>

      {!isSupabaseConfigured ? (
        <p className="border border-border bg-surface p-4 text-sm text-text-secondary">
          Comments aren&apos;t configured yet — copy .env.local.example to
          .env.local with a Supabase project&apos;s URL and anon key to enable
          them.
        </p>
      ) : (
        <>
          <AuthGate
            redirectPath={`/guides/${guideSlug}`}
            featureName="Comments"
          >
            <form
              onSubmit={handleSubmit}
              className="mb-10 border border-border bg-surface p-5"
            >
              <textarea
                required
                maxLength={2000}
                rows={4}
                placeholder="Add a comment..."
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
              />
              {error && <p className="mb-3 text-sm text-warning">{error}</p>}
              <button
                type="submit"
                disabled={submitting || body.trim().length === 0}
                className="interactive-lift border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Posting…" : "Post comment"}
              </button>
            </form>
          </AuthGate>

          {loading ? (
            <p className="text-text-secondary">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="text-text-secondary">
              No comments yet — be the first.
            </p>
          ) : (
            <ul className="space-y-4">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className="border border-border bg-surface p-4"
                >
                  <p className="mb-1 text-sm font-semibold text-text-primary">
                    {comment.identity_label}
                  </p>
                  <p className="text-sm whitespace-pre-wrap text-text-secondary">
                    {comment.body}
                  </p>
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
