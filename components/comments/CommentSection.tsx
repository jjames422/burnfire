"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";
import type { GuideCommentRow } from "@/lib/api/types";
import { AuthGate } from "@/components/auth/AuthGate";

interface CommentSectionProps {
  alliance: string;
  guideSlug: string;
}

export function CommentSection({ alliance, guideSlug }: CommentSectionProps) {
  const { t, locale } = useTranslation();
  const [comments, setComments] = useState<GuideCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadComments() {
      const { data, error: fetchError } = await api<{ comments: GuideCommentRow[] }>(
        `/api/guides/comments?alliance=${encodeURIComponent(alliance)}&slug=${encodeURIComponent(guideSlug)}`,
      );
      if (cancelled) return;
      if (fetchError) setError(fetchError);
      else setComments(data?.comments ?? []);
      setLoading(false);
    }

    loadComments();
    return () => {
      cancelled = true;
    };
  }, [alliance, guideSlug]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: insertError } = await apiPost("/api/guides/comments", {
      alliance,
      guide_slug: guideSlug,
      body: body.trim(),
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setBody("");
    const { data: refreshed, error: refreshError } = await api<{ comments: GuideCommentRow[] }>(
      `/api/guides/comments?alliance=${encodeURIComponent(alliance)}&slug=${encodeURIComponent(guideSlug)}`,
    );
    if (refreshError) setError(refreshError);
    else setComments(refreshed?.comments ?? []);
  }

  return (
    <section className="mt-4 w-full pb-16">
      <h2 className="mb-6 font-display text-2xl font-semibold text-text-primary">
        <Text>{"Comments"}</Text></h2>

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
            placeholder={t("Add a comment...")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mb-3 w-full border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-bright focus:outline-none"
          />
          {error && <p className="mb-3 text-sm text-warning">{t(error)}</p>}
          <button
            type="submit"
            disabled={submitting || body.trim().length === 0}
            className="interactive-lift border border-accent bg-accent px-4 py-2 font-display text-sm font-semibold text-text-primary hover:border-accent-bright hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t("Posting…") : t("Post comment")}
          </button>
        </form>
      </AuthGate>

      {loading ? (
        <p className="text-text-secondary"><Text>{"Loading comments…"}</Text></p>
      ) : comments.length === 0 ? (
        <p className="text-text-secondary">
          <Text>{"No comments yet — be the first."}</Text></p>
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
                {new Date(comment.created_at).toLocaleString(locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
