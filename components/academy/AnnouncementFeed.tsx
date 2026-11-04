"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { ContentLanguageNote, type ContentLanguage } from "@/components/i18n/ContentLanguageNote";


import { useEffect, useState } from "react";
import { api, apiPost } from "@/lib/api/client";

type Announcement = {
  id: string;
  slug: string;
  version: number;
  title: string;
  body: string;
  published_at: string | null;
  required: boolean;
  acknowledged_at: string | null;
  localization?: ContentLanguage;
};

export function AnnouncementFeed() {
  const { t, locale } = useTranslation();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const result = await api<{ announcements: Announcement[] }>("/api/academy/announcements");
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Announcements could not be loaded.");
      return;
    }
    setAnnouncements(result.data.announcements);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function acknowledge(slug: string) {
    const result = await apiPost("/api/academy/acknowledge", { slug });
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (loading) return <p className="text-sm text-text-secondary"><Text>{"Loading announcements…"}</Text></p>;
  return (
    <section className="mx-auto max-w-4xl space-y-4">
      <header className="mb-6">
        <span className="eyebrow"><Text>{"BF2 member communications"}</Text></span>
        <h1 className="mt-2 font-display text-4xl font-semibold"><Text>{"Alliance announcements"}</Text></h1>
      </header>
      {error && <p role="alert" className="border border-warning/40 bg-surface p-3 text-sm text-warning">{t(error)}</p>}
      {announcements.map((announcement) => (
        <article key={announcement.id} className="border border-border bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 lang={announcement.localization?.locale} className="font-display text-2xl font-semibold">{announcement.title}</h2>
              <p className="mt-1 text-xs text-text-secondary"><Text>{"Version"}</Text>{" "}{<LocalizedNumber value={announcement.version} />} · {announcement.published_at ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(announcement.published_at)) : t("Published")}</p>
            </div>
            {announcement.acknowledged_at && <span className="border border-tip px-2 py-1 text-xs text-tip"><Text>{"Acknowledged"}</Text></span>}
          </div>
          <ContentLanguageNote localization={announcement.localization} />
          <div lang={announcement.localization?.locale} className="prose-guide mt-4 whitespace-pre-wrap text-sm text-text-secondary">{announcement.body}</div>
          {announcement.required && !announcement.acknowledged_at && (
            <button onClick={() => void acknowledge(announcement.slug)} className="mt-5 border border-accent px-4 py-2 text-sm hover:bg-accent">
              <Text>{"Acknowledge this announcement"}</Text></button>
          )}
        </article>
      ))}
      {announcements.length === 0 && <p className="border border-border bg-surface p-6 text-sm text-text-secondary"><Text>{"There are no published announcements."}</Text></p>}
    </section>
  );
}
