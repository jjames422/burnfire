"use client";

import "./command.css";

type TrainingMember = {
  user_id: string; in_game_name: string; identity_status: string;
  required_acknowledgments: number; required_total: number; open_followups: number;
};

export function TrainingDashboard({ metrics, assignedOnly, recruits, total, onRecruit, onMembers, onSupport }: {
  metrics: Record<string, string>; assignedOnly: boolean; recruits: TrainingMember[]; total: number;
  onRecruit: (id: string) => Promise<void>; onMembers: () => void; onSupport: () => void;
}) {
  const tracked = Number(metrics.tracked_members ?? 0);
  const completed = Number(metrics.onboarding_completed ?? 0);
  const percent = tracked ? Math.round(completed / tracked * 100) : 0;
  return <>
    <section className="training-hero" aria-label="Training performance">
      <div><span className="training-kicker">{assignedOnly ? "YOUR TRAINING SQUAD" : "ALLIANCE TRAINING NETWORK"}</span><h2>Small milestones.<br /><em>Stronger members.</em></h2><p>{assignedOnly ? "Track the recruits assigned to you, celebrate progress, and step in when they need support." : "A live view of training progress, readiness, and the people who need your support."}</p><div className="training-hero-actions"><button onClick={onMembers}>Track members &rarr;</button><button onClick={onSupport}>Open support queue</button></div></div>
      <div className="training-completion" style={{ background: `conic-gradient(#f4a16d ${percent}%, #34323c 0)` }}><div><strong>{percent}%</strong><span>ACADEMY COMPLETE</span><small>{completed} of {tracked} members</small></div></div>
    </section>
    <div className="training-metrics">
      {[{ key: "tracked_members", label: assignedOnly ? "Your assigned members" : "Members in training" }, { key: "onboarding_completed", label: "Academy graduates" }, { key: "awaiting_identity_verification", label: "Identity reviews waiting" }, { key: "open_followups", label: "Open support requests" }].map((metric, index) => <article key={metric.key}><span className="training-kicker">0{index + 1} / LIVE METRIC</span><strong>{metrics[metric.key] ?? "0"}</strong><p>{metric.label}</p></article>)}
    </div>
    <div className="training-section-heading"><div><span className="training-kicker">PROGRESS, PERSON BY PERSON</span><h2>{assignedOnly ? "Your members" : "Recent members"}</h2></div><button onClick={onMembers}>View all {total} &rarr;</button></div>
    <div className="training-member-grid">{recruits.slice(0, 6).map((recruit) => {
      const progress = recruit.required_total ? Math.round(recruit.required_acknowledgments / recruit.required_total * 100) : 0;
      return <button className="training-member" key={recruit.user_id} onClick={() => void onRecruit(recruit.user_id)}>
        <div className="training-member-heading"><span className="training-avatar">{recruit.in_game_name.slice(0, 2).toUpperCase()}</span><div><h3>{recruit.in_game_name}</h3><p>{recruit.identity_status === "verified" ? "Identity verified" : "Identity review needed"}</p></div><strong>{progress}%</strong></div>
        <div className="training-progress" role="progressbar" aria-label={`${recruit.in_game_name} training completion`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
        <div className="training-member-footer"><span>{recruit.required_acknowledgments} / {recruit.required_total} sections</span><span>{recruit.open_followups ? `${recruit.open_followups} open requests` : "No open requests"}</span></div>
      </button>;
    })}</div>
    {recruits.length === 0 && <p className="training-empty">{assignedOnly ? "No recruits assigned yet. R4, R5, or a site administrator can assign members to your training squad." : "No recruit records yet."}</p>}
  </>;
}
