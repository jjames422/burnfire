"use client";
import { LocalizedNumber } from "@/components/layout/LocalizedNumber";

import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import "./command.css";

type TrainingMember = {
  user_id: string; in_game_name: string; identity_status: string;
  required_acknowledgments: number; required_total: number; open_followups: number;
};

export function TrainingDashboard({ metrics, assignedOnly, recruits, total, onRecruit, onMembers, onSupport }: {
  metrics: Record<string, string>; assignedOnly: boolean; recruits: TrainingMember[]; total: number;
  onRecruit: (id: string) => Promise<void>; onMembers: () => void; onSupport: () => void;
}) {
  const { t, locale } = useTranslation();
  const tracked = Number(metrics.tracked_members ?? 0);
  const completed = Number(metrics.onboarding_completed ?? 0);
  const percent = tracked ? Math.round(completed / tracked * 100) : 0;
  return <>
    <section className="training-hero" aria-label={t("Training performance")}>
      <div><span className="training-kicker">{assignedOnly ? t("YOUR TRAINING SQUAD") : t("ALLIANCE TRAINING NETWORK")}</span><h2><Text>{"Small milestones."}</Text><br /><em><Text>{"Stronger members."}</Text></em></h2><p>{assignedOnly ? t("Track the recruits assigned to you, celebrate progress, and step in when they need support.") : t("A live view of training progress, readiness, and the people who need your support.")}</p><div className="training-hero-actions"><button onClick={onMembers}><Text>{"Track members →"}</Text></button><button onClick={onSupport}><Text>{"Open support queue"}</Text></button></div></div>
      <div className="training-completion" style={{ background: `conic-gradient(#f4a16d ${percent}%, #34323c 0)` }}><div><strong>{<LocalizedNumber value={percent} />}%</strong><span><Text>{"ACADEMY COMPLETE"}</Text></span><small><Text values={{ completed: completed.toLocaleString(locale), tracked: tracked.toLocaleString(locale) }}>{"{completed}  of {tracked}  members"}</Text></small></div></div>
    </section>
    <div className="training-metrics">
      {[{ key: "tracked_members", label: assignedOnly ? t("Your assigned members") : t("Members in training") }, { key: "onboarding_completed", label: "Academy graduates" }, { key: "awaiting_identity_verification", label: "Identity reviews waiting" }, { key: "open_followups", label: "Open support requests" }].map((metric, index) => <article key={metric.key}><span className="training-kicker">0{index + 1} <Text>{"/ LIVE METRIC"}</Text></span><strong>{metrics[metric.key] ?? "0"}</strong><p>{t(metric.label)}</p></article>)}
    </div>
    <div className="training-section-heading"><div><span className="training-kicker"><Text>{"PROGRESS, PERSON BY PERSON"}</Text></span><h2>{assignedOnly ? t("Your members") : t("Recent members")}</h2></div><button onClick={onMembers}><Text values={{ total: total.toLocaleString(locale) }}>{"View all {total} →"}</Text></button></div>
    <div className="training-member-grid">{recruits.slice(0, 6).map((recruit) => {
      const progress = recruit.required_total ? Math.round(recruit.required_acknowledgments / recruit.required_total * 100) : 0;
      return <button className="training-member" key={recruit.user_id} onClick={() => void onRecruit(recruit.user_id)}>
        <div className="training-member-heading"><span className="training-avatar">{recruit.in_game_name.slice(0, 2).toUpperCase()}</span><div><h3>{recruit.in_game_name}</h3><p>{recruit.identity_status === "verified" ? t("Identity verified") : t("Identity review needed")}</p></div><strong>{<LocalizedNumber value={progress} />}%</strong></div>
        <div className="training-progress" role="progressbar" aria-label={t("{name} training completion", { name: recruit.in_game_name })} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
        <div className="training-member-footer"><span><Text values={{ required_acknowledgments: recruit.required_acknowledgments.toLocaleString(locale), required_total: recruit.required_total.toLocaleString(locale) }}>{"{required_acknowledgments} / {required_total}  sections"}</Text></span><span>{recruit.open_followups ? t("{count} open requests", { count: recruit.open_followups }) : t("No open requests")}</span></div>
      </button>;
    })}</div>
    {recruits.length === 0 && <p className="training-empty">{assignedOnly ? t("No recruits assigned yet. R4, R5, or a site administrator can assign members to your training squad.") : t("No recruit records yet.")}</p>}
  </>;
}
