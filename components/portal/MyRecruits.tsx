"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { api } from "@/lib/api/client";

type AssignedRecruit = {
  user_id: string;
  in_game_name: string;
  identity_status: string;
  completed_at: string | null;
  required_acknowledgments: number;
  required_total: number;
  latest_quiz_passed: boolean | null;
  open_followups: number;
  last_activity: string;
};
type HelpItem = { user_id: string; issue_key: string; reason: string; training_title: string | null };

// Explicit requests for help come first; unread sections are already shown by the progress bar.
const HELP_ORDER = ["assistance:", "help:", "failed-quiz:", "stalled:", "identity-pending", "not-started"];
function helpPriority(issueKey: string): number {
  const index = HELP_ORDER.findIndex((prefix) => issueKey.startsWith(prefix));
  return index === -1 ? HELP_ORDER.length : index;
}

/**
 * The officer's own training squad on the portal home: who is assigned to them,
 * how far each recruit has progressed, and exactly what they need help with.
 * R3 trainers only ever receive their own recruits from the API.
 */
export function MyRecruits({ leadership }: { leadership: boolean }) {
  const { t, locale } = useTranslation();
  const [recruits, setRecruits] = useState<AssignedRecruit[] | null>(null);
  const [help, setHelp] = useState<HelpItem[]>([]);
  const [unassigned, setUnassigned] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api<{ recruits: AssignedRecruit[] }>("/api/command/recruits?officer=me&sort=activity&direction=desc"),
      api<{ attention: HelpItem[] }>("/api/command/attention"),
      leadership ? api<{ total: number }>("/api/command/recruits?officer=unassigned") : Promise.resolve(null),
    ]).then(([mine, attention, open]) => {
      if (!active) return;
      if (mine.error || !mine.data) {
        setError(mine.error ?? "Recruit records could not be loaded.");
        return;
      }
      setRecruits(mine.data.recruits);
      setHelp(attention.data?.attention ?? []);
      if (open && !open.error && open.data) setUnassigned(open.data.total);
    });
    return () => { active = false; };
  }, [leadership]);

  return (
    <section className="portal-panel portal-recruits">
      <div className="portal-section-heading">
        <h2><Text>{"Your recruits"}</Text></h2>
        <Link href="/command?tab=recruits"><Text>{"Enter command →"}</Text></Link>
      </div>
      <p><Text>{"Your assigned members. Their next milestone. Your opportunity to help."}</Text></p>
      {leadership && unassigned !== null && unassigned > 0 && (
        <p className="portal-recruits-unassigned">
          <Text values={{ count: unassigned.toLocaleString(locale) }}>{"{count} recruits have no officer yet."}</Text>{" "}
          <Link href="/command?tab=recruits"><Text>{"Assign officers →"}</Text></Link>
        </p>
      )}
      {error && <p role="alert" className="portal-alert">{t(error)}</p>}
      {recruits === null && !error && <p role="status"><Text>{"Loading recruit record…"}</Text></p>}
      {recruits?.length === 0 && <p><Text>{"No recruits assigned yet. R4, R5, or a site administrator can assign members to your training squad."}</Text></p>}
      {recruits && recruits.length > 0 && (
        <ul>
          {recruits.map((recruit) => {
            const needs = help
              .filter((item) => item.user_id === recruit.user_id && !item.issue_key.startsWith("unacknowledged:"))
              .sort((first, second) => helpPriority(first.issue_key) - helpPriority(second.issue_key));
            const percent = recruit.required_total ? Math.round(recruit.required_acknowledgments / recruit.required_total * 100) : 0;
            return (
              <li key={recruit.user_id}>
                <div className="portal-recruit-main">
                  <strong>{recruit.in_game_name}</strong>
                  <p>
                    {recruit.completed_at ? t("ACADEMY COMPLETE") : t("{required_acknowledgments} / {required_total}  sections", { required_acknowledgments: recruit.required_acknowledgments, required_total: recruit.required_total })}
                    {" · "}{recruit.latest_quiz_passed === null ? t("quiz not taken") : recruit.latest_quiz_passed ? t("quiz passed") : t("quiz failed")}
                    {" · "}{recruit.open_followups ? t("{count} open requests", { count: recruit.open_followups }) : t("No open requests")}
                    {" · "}{t("Last activity")}: {new Date(recruit.last_activity).toLocaleDateString(locale)}
                  </p>
                  <div className="portal-recruit-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
                  {needs.length > 0 && (
                    <div className="portal-recruit-help">
                      <small><Text>{"Needs help with"}</Text></small>
                      <ul>{needs.slice(0, 4).map((item) => <li key={item.issue_key}>{item.training_title ? `${t(item.training_title)} — ` : ""}{t(item.reason)}</li>)}</ul>
                      {needs.length > 4 && <small><Text values={{ count: (needs.length - 4).toLocaleString(locale) }}>{"+{count} more in the Command Center"}</Text></small>}
                    </div>
                  )}
                </div>
                <Link className="portal-secondary" href={`/command?tab=recruits&recruit=${encodeURIComponent(recruit.user_id)}`}><Text>{"Help this recruit →"}</Text></Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
