"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";
import { MemberManager } from "@/components/portal/MemberManager";
import { TrainingDashboard } from "./TrainingDashboard";

type Tab = "overview" | "recruits" | "training" | "followups" | "reports" | "content" | "members";
type Metrics = Record<string, string>;
type Overview = { metrics: Metrics; officer_rank: "r1" | "r2" | "r3" | "r4" | "r5" | null; is_site_admin: boolean; can_edit_content: boolean; assigned_only: boolean };
type Recruit = {
  user_id: string;
  in_game_name: string;
  email?: string;
  communication_preference: "external_chat" | "website" | "both" | null;
  identity_status: string;
  started_at: string;
  completed_at: string | null;
  invitation_opened_at: string | null;
  required_acknowledgments: number;
  required_total: number;
  latest_quiz_passed: boolean | null;
  open_followups: number;
  last_activity: string;
  officer_interest: string | null;
  game_identifier: string | null;
};
type Attention = {
  user_id: string;
  in_game_name: string;
  issue_key: string;
  reason: string;
  training_title: string | null;
  created_at: string;
};
type RecruitInvitation = {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  redeemed_at: string | null;
  status: string;
};
type Reports = {
  confusion: { slug: string; title: string; failed_latest: number; help_requests: number }[];
  officer_followups: { officer: string; unresolved_tasks: number }[];
};
type TrainingRow = {
  user_id: string;
  in_game_name: string;
  slug: string;
  title: string;
  status: string;
  needs_assistance: boolean;
  quiz_passed: boolean | null;
  acknowledged_at: string | null;
};
type Followup = {
  id: string;
  user_id: string;
  in_game_name: string;
  training_title: string | null;
  issue_key: string;
  reason: string;
  status: "open" | "contacted" | "awaiting_response" | "resolved";
  officer_notes: string;
  created_at: string;
  edits: { previous_status: string; previous_notes: string; edited_at: string; editor_name: string | null }[];
};
type Invitation = {
  invitation_url: string;
  email_sent: boolean;
  email_error: string | null;
};
type ContentItem = {
  id: string;
  slug: string;
  version: number;
  content_type: "rule" | "module" | "announcement";
  title: string;
  body: string;
  required: boolean;
  status: "draft" | "published" | "retired";
  verification_status: "verified" | "leadership_review";
  questions: {
    slug: string;
    prompt: string;
    options: string[];
    correct_index: number;
    explanation: string;
    sort_order: number;
  }[];
};
type RecruitDetail = {
  recruit: Record<string, string | number | boolean | null>;
  invitation: { created_at: string; opened_at: string | null; redeemed_at: string; invited_by_name: string } | null;
  training: {
    slug: string;
    title: string;
    version: number;
    verification_status: string;
    status: string;
    updated_at: string | null;
    completed_at: string | null;
    acknowledged_at: string | null;
    quiz_passed: boolean | null;
    quiz_at: string | null;
  }[];
  followups: Followup[];
  notes: { id: string; body: string; author_name: string; created_at: string; updated_at: string }[];
  note_history: { note_id: string; previous_body: string; edited_at: string; editor_name: string | null }[];
  identity_history: { previous_status: string; new_status: string; note: string | null; changed_at: string; changed_by_name: string | null }[];
  officers: { id: string; in_game_name: string; game_rank: string }[];
};

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "recruits", label: "Recruits" },
  { id: "training", label: "Training" },
  { id: "followups", label: "Follow-ups" },
  { id: "reports", label: "Reports" },
  { id: "content", label: "Leadership CMS" },
  { id: "members", label: "Members & oversight" },
];

const METRICS: { key: string; label: string }[] = [
  { key: "tracked_members", label: "Tracked members" },
  { key: "new_recruits", label: "New recruits · 7 days" },
  { key: "pending_invitations", label: "Pending invitations" },
  { key: "onboarding_in_progress", label: "Onboarding in progress" },
  { key: "onboarding_completed", label: "Onboarding completed" },
  { key: "awaiting_identity_verification", label: "Awaiting identity verification" },
  { key: "awaiting_acknowledgment", label: "Awaiting required acknowledgments" },
  { key: "needs_assistance", label: "Members needing assistance" },
  { key: "failed_knowledge_checks", label: "Failed latest knowledge check" },
  { key: "open_followups", label: "Open officer follow-ups" },
  { key: "website_preference", label: "Prefer the website" },
  { key: "external_chat_preference", label: "Prefer external chat" },
  { key: "interested_in_r3", label: "Interested in future R3" },
];

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function Status({ children }: { children: string }) {
  return <span className="inline-flex border border-border px-2 py-1 text-xs capitalize text-text-secondary">{children.replaceAll("_", " ")}</span>;
}

export function CommandPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recruits, setRecruits] = useState<Recruit[]>([]);
  const [training, setTraining] = useState<TrainingRow[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [invitations, setInvitations] = useState<RecruitInvitation[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [reports, setReports] = useState<Reports | null>(null);
  const [detail, setDetail] = useState<RecruitDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("started");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  async function loadOverview() {
    const result = await api<Overview>("/api/command/overview");
    if (result.error || !result.data) {
      setError(result.error ?? "Command overview could not be loaded.");
      return;
    }
    setOverview(result.data);
    setError(null);
  }

  async function loadRecruits(nextPage = 1, nextSearch = search, nextSort = sort) {
    const params = new URLSearchParams({
      q: nextSearch,
      page: String(nextPage),
      sort: nextSort,
      direction: "desc",
    });
    const result = await api<{ recruits: Recruit[]; total: number }>(`/api/command/recruits?${params}`);
    if (result.error || !result.data) {
      setError(result.error ?? "Recruit records could not be loaded.");
      return;
    }
    setRecruits(result.data.recruits);
    setTotal(result.data.total);
    setPage(nextPage);
    setError(null);
  }

  async function loadFollowups() {
    const result = await api<{ followups: Followup[] }>("/api/command/followups");
    if (result.error || !result.data) setError(result.error ?? "Follow-ups could not be loaded.");
    else {
      setFollowups(result.data.followups);
      setError(null);
    }
  }

  async function loadTraining() {
    const result = await api<{ training: TrainingRow[] }>("/api/command/training");
    if (result.error || !result.data) setError(result.error ?? "Training records could not be loaded.");
    else {
      setTraining(result.data.training);
      setError(null);
    }
  }

  async function loadContent() {
    const result = await api<{ content: ContentItem[] }>("/api/command/content");
    if (result.error || !result.data) setError(result.error ?? "Content could not be loaded.");
    else {
      setContent(result.data.content);
      setError(null);
    }
  }

  async function loadReports() {
    const result = await api<Reports>("/api/command/reports");
    if (result.error || !result.data) setError(result.error ?? "Reports could not be loaded.");
    else {
      setReports(result.data);
      setError(null);
    }
  }

  async function loadAttention() {
    const result = await api<{ attention: Attention[] }>("/api/command/attention");
    if (result.error || !result.data) setError(result.error ?? "Attention queue could not be loaded.");
    else setAttention(result.data.attention);
  }

  async function loadInvitations() {
    const result = await api<{ invitations: RecruitInvitation[] }>("/api/command/invitations");
    if (result.error || !result.data) setError(result.error ?? "Invitations could not be loaded.");
    else setInvitations(result.data.invitations);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Overview>("/api/command/overview"),
      api<{ recruits: Recruit[]; total: number }>("/api/command/recruits?page=1&sort=started"),
      api<{ attention: Attention[] }>("/api/command/attention"),
      api<{ invitations: RecruitInvitation[] }>("/api/command/invitations"),
    ]).then(([overviewResult, recruitResult, attentionResult, invitationResult]) => {
      if (!active) return;
      if (overviewResult.error || !overviewResult.data) setError(overviewResult.error ?? "Command overview could not be loaded.");
      else setOverview(overviewResult.data);
      if (recruitResult.error || !recruitResult.data) setError(recruitResult.error ?? "Recruit records could not be loaded.");
      else {
        setRecruits(recruitResult.data.recruits);
        setTotal(recruitResult.data.total);
      }
      if (!active) return;
      if (attentionResult.error || !attentionResult.data) {
        setError(attentionResult.error ?? "Attention queue could not be loaded.");
      } else {
        setAttention(attentionResult.data.attention);
      }
      if (invitationResult.error || !invitationResult.data) {
        setError(invitationResult.error ?? "Invitations could not be loaded.");
      } else {
        setInvitations(invitationResult.data.invitations);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (tab === "recruits") void loadInvitations();
    if (tab === "training") void loadTraining();
    if (tab === "followups") void loadFollowups();
    if (tab === "reports") void loadReports();
    if (tab === "content" && overview?.can_edit_content) void loadContent();
  }, [tab, overview]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    api<RecruitDetail>(`/api/command/recruits/${encodeURIComponent(selectedId)}`)
      .then((result) => {
        if (!active) return;
        if (result.error) {
          setError(result.error);
          setSelectedId(null);
        }
        else setDetail(result.data);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function handleInvite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteBusy(true);
    setInvitation(null);
    setInviteError(null);
    const result = await apiPost<{ invitation: Invitation }>(
      "/api/command/invitations",
      { email: inviteEmail.trim() },
    );
    setInviteBusy(false);
    if (result.error || !result.data) {
      setInviteError(result.error ?? "Invitation could not be created.");
      return;
    }
    setInvitation(result.data.invitation);
    setInviteEmail("");
    await loadOverview();
    await loadInvitations();
  }

  async function openRecruit(userId: string) {
    setDetail(null);
    setSelectedId(userId);
  }

  async function updateFollowup(followup: Followup) {
    const result = await api("/api/command/followups", {
      method: "PATCH",
      body: JSON.stringify({
        id: followup.id,
        status: followup.status,
        officer_notes: followup.officer_notes,
      }),
    });
    if (result.error) setError(result.error);
    else {
      setError(null);
      await loadFollowups();
      await loadOverview();
      await loadAttention();
    }
  }

  async function verifyIdentity(verified: boolean) {
    if (!selectedId) return;
    const result = await api(`/api/command/recruits/${encodeURIComponent(selectedId)}/identity`, {
      method: "PATCH",
      body: JSON.stringify({ verified }),
    });
    if (result.error) setError(result.error);
    else {
      setError(null);
      const refreshed = await api<RecruitDetail>(`/api/command/recruits/${encodeURIComponent(selectedId)}`);
      if (!refreshed.error) setDetail(refreshed.data);
      await loadOverview();
    }
  }

  async function assignOfficer(assignedTo: string) {
    if (!selectedId) return;
    const result = await api(`/api/command/recruits/${encodeURIComponent(selectedId)}/assignment`, {
      method: "PATCH",
      body: JSON.stringify({ assigned_to: assignedTo || null }),
    });
    if (result.error) setError(result.error);
    else {
      setError(null);
      const refreshed = await api<RecruitDetail>(`/api/command/recruits/${encodeURIComponent(selectedId)}`);
      if (!refreshed.error && refreshed.data) setDetail(refreshed.data);
    }
  }

  async function addNote(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await apiPost(
      `/api/command/recruits/${encodeURIComponent(selectedId)}/notes`,
      { body: formData.get("note") },
    );
    if (result.error) setError(result.error);
    else {
      form.reset();
      setError(null);
      const refreshed = await api<RecruitDetail>(`/api/command/recruits/${encodeURIComponent(selectedId)}`);
      if (!refreshed.error) setDetail(refreshed.data);
    }
  }

  async function editNote(id: string, body: string) {
    const result = await api(`/api/command/notes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ body }),
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    if (!selectedId) return;
    const refreshed = await api<RecruitDetail>(`/api/command/recruits/${encodeURIComponent(selectedId)}`);
    if (!refreshed.error && refreshed.data) setDetail(refreshed.data);
  }

  const leadership = Boolean(overview?.is_site_admin || overview?.officer_rank === "r4" || overview?.officer_rank === "r5");
  const tabs = TABS.filter((item) => item.id === "content" ? overview?.can_edit_content : item.id === "members" ? leadership : true);

  return (
    <div className="command-workspace mx-auto max-w-7xl py-4">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <span className="eyebrow">BurnFire · BF2 leadership</span>
          <h1 className="mt-2 font-display text-4xl font-semibold">{overview?.assigned_only ? "Training headquarters" : "Command Center"}</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-secondary">
            {overview?.assigned_only ? "Your assigned members. Their next milestone. Your opportunity to help." : "Recruit onboarding, identity verification, training compliance, and officer follow-up."}
            All figures below are loaded from current records.
          </p>
        </div>
        {overview && <Status>{overview.is_site_admin ? "site administrator" : `${overview.officer_rank?.toUpperCase()} ${overview.assigned_only ? "trainer" : "officer"}`}</Status>}
      </header>

      <nav className="mb-7 flex flex-wrap gap-2" aria-label="Command Center sections">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); setError(null); }}
            className={`border px-4 py-2 text-sm ${tab === item.id ? "border-accent bg-accent text-text-primary" : "border-border bg-surface text-text-secondary hover:text-text-primary"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="mb-5 border border-warning/40 bg-surface p-3 text-sm text-warning">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-text-secondary">Loading command records…</p>
      ) : error?.includes("permission") || error?.includes("Sign in") ? (
        <section className="border border-border bg-surface p-6">
          <h2 className="font-display text-xl font-semibold">Officer access required</h2>
          <p className="mt-2 text-sm text-text-secondary">
            The Command Center is available to verified BurnFire R3 officers and above.
          </p>
        </section>
      ) : (
        <>
          {tab === "members" && leadership && <MemberManager />}
          {tab === "overview" && overview && (
            <section>
              <TrainingDashboard metrics={overview.metrics} assignedOnly={overview.assigned_only} recruits={recruits} total={total} onRecruit={openRecruit} onMembers={() => setTab("recruits")} onSupport={() => setTab("followups")} />
              <h2 className="mb-4 mt-8 font-display text-2xl">Training pulse</h2>
              <div className="training-pulse">
                {METRICS.map((metric) => (
                  <article key={metric.key}>
                    <p className="text-xs text-text-secondary">{metric.label}</p>
                    <strong className="mt-2 block font-display text-3xl">
                      {overview.metrics[metric.key] ?? "0"}
                    </strong>
                  </article>
                ))}
              </div>
              <section className="mt-8 border border-border bg-surface p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">Members Requiring Attention</h2>
                    <p className="mt-1 text-sm text-text-secondary">Derived from incomplete onboarding, pending identity, missed checks, help requests, stalled sections, and current acknowledgments.</p>
                  </div>
                  <button onClick={() => void loadAttention()} className="border border-border px-3 py-2 text-sm">Refresh</button>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="text-xs uppercase text-text-secondary"><tr><th className="py-2">Recruit</th><th className="py-2">Requirement</th><th className="py-2">Reason</th><th className="py-2">Since</th></tr></thead>
                    <tbody>
                      {attention.slice(0, 20).map((item, index) => (
                        <tr key={`${item.user_id}:${item.issue_key}:${index}`} className="border-t border-border">
                          <td className="py-2"><button onClick={() => void openRecruit(item.user_id)} className="text-accent-bright underline">{item.in_game_name}</button></td>
                          <td className="py-2">{item.training_title ?? item.issue_key}</td>
                          <td className="py-2">{item.reason}</td>
                          <td className="py-2">{dateLabel(item.created_at)}</td>
                        </tr>
                      ))}
                      {attention.length === 0 && <tr><td className="py-4 text-text-secondary" colSpan={4}>No members currently require follow-up.</td></tr>}
                    </tbody>
                  </table>
                  {attention.length > 20 && <p className="mt-3 text-xs text-text-secondary">Showing the first 20 of {attention.length} current attention records.</p>}
                </div>
              </section>
              <section className="mt-8 border border-border bg-surface p-5">
                <h2 className="font-display text-2xl font-semibold">Invite a recruit</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  The secure link is single-use and expires after 14 days. The invited member can
                  sign in with email and complete the academy on the website.
                </p>
                <form onSubmit={handleInvite} className="mt-4 flex flex-wrap gap-3">
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="recruit@example.com"
                    className="min-w-60 flex-1 border border-border bg-bg px-3 py-2"
                  />
                  <button
                    type="submit"
                    disabled={inviteBusy}
                    className="interactive-lift border border-accent bg-accent px-5 py-2 font-display font-semibold disabled:opacity-50"
                  >
                    {inviteBusy ? "Creating…" : "Create and send invitation"}
                  </button>
                </form>
                {inviteError && <p role="alert" className="mt-3 text-sm text-warning">{inviteError}</p>}
                {invitation && (
                  <div className="mt-4 border border-border bg-bg p-4">
                    <p className="text-sm">
                      {invitation.email_sent
                        ? "Invitation email sent."
                        : "Email service is not configured; share this secure link directly."}
                    </p>
                    {invitation.email_error && <p className="mt-1 text-sm text-warning">{invitation.email_error}</p>}
                    <a className="mt-2 block break-all text-sm text-accent-bright underline" href={invitation.invitation_url}>
                      {invitation.invitation_url}
                    </a>
                  </div>
                )}
              </section>
            </section>
          )}

          {tab === "reports" && reports && (
            <section>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold">Recruit support signals</h2>
                  <p className="mt-1 text-sm text-text-secondary">Counts are derived from latest quiz attempts and unresolved help records.</p>
                </div>
                <a href="/api/command/reports?format=csv" className="border border-accent px-4 py-2 text-sm hover:bg-accent">Export minimal CSV</a>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="overflow-x-auto border border-border">
                  <h3 className="bg-surface px-3 py-3 font-display text-lg">Training sections generating confusion</h3>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-text-secondary"><tr><th className="px-3 py-2">Section</th><th className="px-3 py-2">Latest failures</th><th className="px-3 py-2">Help requests</th></tr></thead>
                    <tbody>{reports.confusion.map((row) => <tr key={row.slug} className="border-t border-border"><td className="px-3 py-2">{row.title}</td><td className="px-3 py-2">{row.failed_latest}</td><td className="px-3 py-2">{row.help_requests}</td></tr>)}</tbody>
                  </table>
                </section>
                <section className="overflow-x-auto border border-border">
                  <h3 className="bg-surface px-3 py-3 font-display text-lg">Unresolved work by assigned officer</h3>
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-text-secondary"><tr><th className="px-3 py-2">Officer</th><th className="px-3 py-2">Open tasks</th></tr></thead>
                    <tbody>{reports.officer_followups.map((row) => <tr key={row.officer} className="border-t border-border"><td className="px-3 py-2">{row.officer}</td><td className="px-3 py-2">{row.unresolved_tasks}</td></tr>)}</tbody>
                  </table>
                </section>
              </div>
            </section>
          )}

          {tab === "recruits" && (
            <section>
              <section className="mb-6 border border-border bg-surface p-4">
                <h2 className="font-display text-xl font-semibold">Invitation activity</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="text-xs uppercase text-text-secondary"><tr><th className="py-2">Email</th><th className="py-2">Created</th><th className="py-2">Opened</th><th className="py-2">Redeemed</th><th className="py-2">Status</th></tr></thead>
                    <tbody>
                      {invitations.map((item) => <tr key={item.id} className="border-t border-border"><td className="py-2">{item.email}</td><td className="py-2">{dateLabel(item.created_at)}</td><td className="py-2">{item.opened_at ? dateLabel(item.opened_at) : "Not opened"}</td><td className="py-2">{item.redeemed_at ? dateLabel(item.redeemed_at) : "Not redeemed"}</td><td className="py-2"><Status>{item.status}</Status></td></tr>)}
                      {invitations.length === 0 && <tr><td className="py-3 text-text-secondary" colSpan={5}>No recent invitations.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
              <form
                className="mb-4 flex flex-wrap gap-3"
                onSubmit={(event) => { event.preventDefault(); void loadRecruits(1); }}
              >
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search in-game name or game ID"
                  className="min-w-60 flex-1 border border-border bg-surface px-3 py-2"
                />
                <select
                  value={sort}
                  onChange={(event) => { setSort(event.target.value); void loadRecruits(1, search, event.target.value); }}
                  className="border border-border bg-surface px-3 py-2"
                  aria-label="Sort recruits"
                >
                  <option value="started">Start date</option>
                  <option value="activity">Last activity</option>
                  <option value="name">Player name</option>
                  <option value="identity">Identity status</option>
                </select>
                <button className="border border-border bg-surface px-4 py-2">Search</button>
              </form>
              <div className="overflow-x-auto border border-border">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead className="bg-surface text-xs uppercase text-text-secondary">
                    <tr>{["Player", "Preference", "Invitation opened", "Identity", "Training acknowledgments", "Quiz", "Follow-ups", "Last activity"].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr>
                  </thead>
                  <tbody>
                    {recruits.map((recruit) => (
                      <tr key={recruit.user_id} className="border-t border-border hover:bg-surface">
                        <td className="px-3 py-3">
                          <button type="button" className="font-medium text-accent-bright underline" onClick={() => void openRecruit(recruit.user_id)}>
                            {recruit.in_game_name}
                          </button>
                          {recruit.email && <small className="block text-text-secondary">{recruit.email}</small>}
                        </td>
                        <td className="px-3 py-3"><Status>{recruit.communication_preference ?? "not selected"}</Status></td>
                        <td className="px-3 py-3">{recruit.invitation_opened_at ? "Yes" : "No"}</td>
                        <td className="px-3 py-3"><Status>{recruit.identity_status}</Status></td>
                        <td className="px-3 py-3">{recruit.required_acknowledgments}/{recruit.required_total}</td>
                        <td className="px-3 py-3">{recruit.latest_quiz_passed === null ? "Not taken" : recruit.latest_quiz_passed ? "Passed" : "Needs retry"}</td>
                        <td className="px-3 py-3">{recruit.open_followups}</td>
                        <td className="px-3 py-3">{dateLabel(recruit.last_activity)}</td>
                      </tr>
                    ))}
                    {recruits.length === 0 && <tr><td className="px-3 py-8 text-center text-text-secondary" colSpan={8}>No matching recruit records.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
                <span>{total} tracked recruit{total === 1 ? "" : "s"}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => void loadRecruits(page - 1)} className="border border-border px-3 py-1 disabled:opacity-40">Previous</button>
                  <span className="px-2">Page {page}</span>
                  <button disabled={page * 30 >= total} onClick={() => void loadRecruits(page + 1)} className="border border-border px-3 py-1 disabled:opacity-40">Next</button>
                </div>
              </div>
            </section>
          )}

          {tab === "training" && (
            <section className="overflow-x-auto border border-border">
              <table className="w-full min-w-[750px] border-collapse text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-text-secondary">
                  <tr>{["Recruit", "Requirement", "Progress", "Knowledge check", "Acknowledgment"].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr>
                </thead>
                <tbody>
                  {training.map((row) => (
                    <tr key={`${row.user_id}:${row.slug}`} className="border-t border-border">
                      <td className="px-3 py-3">{row.in_game_name}</td>
                      <td className="px-3 py-3">{row.title}</td>
                      <td className="px-3 py-3"><Status>{row.needs_assistance ? "needs_assistance" : row.status}</Status></td>
                      <td className="px-3 py-3">{row.quiz_passed === null ? "Not taken" : row.quiz_passed ? "Passed" : "Failed"}</td>
                      <td className="px-3 py-3">{row.acknowledged_at ? dateLabel(row.acknowledged_at) : "Pending"}</td>
                    </tr>
                  ))}
                  {training.length === 0 && <tr><td className="px-3 py-8 text-center text-text-secondary" colSpan={5}>No published training records.</td></tr>}
                </tbody>
              </table>
            </section>
          )}

          {tab === "followups" && (
            <section className="space-y-4">
              {followups.map((followup) => (
                <article key={followup.id} className="border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold">{followup.in_game_name}</h2>
                      <p className="mt-1 text-sm text-text-secondary">{followup.training_title ?? followup.issue_key} · {followup.reason}</p>
                      <p className="mt-1 text-xs text-text-secondary">Created {dateLabel(followup.created_at)}</p>
                    </div>
                    <label className="text-sm">
                      <span className="sr-only">Follow-up status</span>
                      <select
                        value={followup.status}
                        onChange={(event) => setFollowups((current) => current.map((task) => task.id === followup.id ? { ...task, status: event.target.value as Followup["status"] } : task))}
                        className="border border-border bg-bg px-3 py-2"
                      >
                        <option value="open">Open</option>
                        <option value="contacted">Contacted</option>
                        <option value="awaiting_response">Awaiting response</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block text-text-secondary">Internal officer notes</span>
                    <textarea
                      rows={2}
                      maxLength={4000}
                      value={followup.officer_notes}
                      onChange={(event) => setFollowups((current) => current.map((task) => task.id === followup.id ? { ...task, officer_notes: event.target.value } : task))}
                      className="w-full border border-border bg-bg px-3 py-2"
                    />
                  </label>
                  {followup.edits?.map((edit, index) => (
                    <p key={`${edit.edited_at}:${index}`} className="mt-2 border-t border-border pt-2 text-xs text-text-secondary">
                      Previous update · {edit.editor_name ?? "Officer"} · {dateLabel(edit.edited_at)} · {edit.previous_status}
                      {edit.previous_notes ? ` · ${edit.previous_notes}` : ""}
                    </p>
                  ))}
                  <button onClick={() => void updateFollowup(followup)} className="mt-3 border border-accent px-4 py-2 text-sm hover:bg-accent">
                    Save follow-up
                  </button>
                </article>
              ))}
              {followups.length === 0 && <p className="border border-border bg-surface p-6 text-sm text-text-secondary">No unresolved follow-ups.</p>}
            </section>
          )}

          {tab === "content" && overview?.can_edit_content && (
            <ContentEditor content={content} refresh={loadContent} />
          )}
        </>
      )}

      {selectedId && (
        <RecruitDetailPanel
          detail={detail}
          onClose={() => setSelectedId(null)}
          onVerify={verifyIdentity}
          onAssign={assignOfficer}
          onAddNote={addNote}
          onEditNote={editNote}
          canAssign={leadership}
        />
      )}
    </div>
  );
}

function RecruitDetailPanel({
  detail,
  onClose,
  onVerify,
  onAssign,
  onAddNote,
  onEditNote,
  canAssign,
}: {
  detail: RecruitDetail | null;
  onClose: () => void;
  onVerify: (verified: boolean) => Promise<void>;
  onAssign: (assignedTo: string) => Promise<void>;
  onAddNote: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  onEditNote: (id: string, body: string) => Promise<void>;
  canAssign: boolean;
}) {
  const [editingNote, setEditingNote] = useState<string | null>(null);

  if (!detail) {
    return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><p className="border border-border bg-surface p-6">Loading recruit record…</p></div>;
  }
  const recruit = detail.recruit;
  const status = String(recruit.identity_status ?? "pending");
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-4 sm:p-8">
      <section className="mx-auto max-w-4xl border border-border bg-bg p-5 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Recruit record</span>
            <h2 className="mt-1 font-display text-3xl font-semibold">{String(recruit.in_game_name)}</h2>
            {typeof recruit.email === "string" && <p className="mt-1 text-sm text-text-secondary">{recruit.email}</p>}
          </div>
          <button onClick={onClose} className="border border-border px-3 py-2 text-sm">Close</button>
        </header>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <p className="border border-border p-3 text-sm">Communication: {String(recruit.communication_preference ?? "Not selected")}</p>
          <label className="border border-border p-3 text-sm">
            Assigned officer
            <select
              value={String(recruit.assigned_officer ?? "")}
              disabled={!canAssign}
              onChange={(event) => { void onAssign(event.target.value); }}
              className="mt-2 block w-full border border-border bg-bg px-2 py-1"
            >
              <option value="">Unassigned</option>
              {detail.officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.in_game_name} · {officer.game_rank.toUpperCase()}</option>)}
            </select>
          </label>
          <p className="border border-border p-3 text-sm">Game ID: {String(recruit.game_identifier ?? "Not submitted")}</p>
          <p className="border border-border p-3 text-sm">Academy started: {dateLabel(String(recruit.started_at ?? ""))}</p>
        </div>
        <section className="mt-6 border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-display text-xl font-semibold">Identity verification</h3><p className="mt-1 text-sm text-text-secondary">The website does not access game data; verify the submitted identity manually.</p></div>
            <Status>{status}</Status>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void onVerify(true)} className="border border-tip px-3 py-2 text-sm">Mark verified</button>
            <button onClick={() => void onVerify(false)} className="border border-border px-3 py-2 text-sm">Return to pending</button>
          </div>
          {detail.identity_history.length > 0 && (
            <ul className="mt-4 space-y-2 text-xs text-text-secondary">
              {detail.identity_history.map((item, index) => <li key={`${item.changed_at}:${index}`}>{item.previous_status} → {item.new_status} · {item.changed_by_name ?? "Officer"} · {dateLabel(item.changed_at)}{item.note ? ` · ${item.note}` : ""}</li>)}
            </ul>
          )}
        </section>
        <section className="mt-6">
          <h3 className="font-display text-xl font-semibold">Onboarding timeline</h3>
          {detail.invitation && <p className="mt-2 text-sm text-text-secondary">Invitation created {dateLabel(detail.invitation.created_at)} · opened {detail.invitation.opened_at ? dateLabel(detail.invitation.opened_at) : "not yet"} · redeemed {dateLabel(detail.invitation.redeemed_at)}</p>}
          <ol className="mt-3 space-y-2">
            {detail.training.map((item) => (
              <li key={item.slug} className="flex flex-wrap items-center justify-between gap-2 border border-border p-3 text-sm">
                <span>{item.title}{item.verification_status === "leadership_review" ? " · mechanics need leadership review" : ""}</span>
                <span className="flex gap-2"><Status>{item.status}</Status><Status>{item.quiz_passed === null ? "quiz not taken" : item.quiz_passed ? "quiz passed" : "quiz failed"}</Status><Status>{item.acknowledged_at ? "acknowledged" : "ack pending"}</Status></span>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-6">
          <h3 className="font-display text-xl font-semibold">Private officer notes</h3>
          <form onSubmit={onAddNote} className="mt-3">
            <textarea name="note" required maxLength={4000} rows={3} className="w-full border border-border bg-surface px-3 py-2" placeholder="Visible to authorized officers only" />
            <button className="mt-2 border border-accent px-4 py-2 text-sm">Add note</button>
          </form>
          <ul className="mt-4 space-y-3">
            {detail.notes.map((note) => (
              <li key={note.id} className="border border-border bg-surface p-3">
                {editingNote === note.id ? (
                  <form
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const formData = new FormData(form);
                      await onEditNote(note.id, String(formData.get("body") ?? ""));
                      setEditingNote(null);
                    }}
                  >
                    <textarea name="body" required maxLength={4000} defaultValue={note.body} rows={3} className="w-full border border-border bg-bg px-3 py-2 text-sm" />
                    <div className="mt-2 flex gap-2">
                      <button className="border border-accent px-3 py-1 text-xs">Save edit</button>
                      <button type="button" onClick={() => setEditingNote(null)} className="border border-border px-3 py-1 text-xs">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <small className="text-text-secondary">{note.author_name} · {dateLabel(note.created_at)}{note.updated_at !== note.created_at ? " · edited" : ""}</small>
                      <button type="button" onClick={() => setEditingNote(note.id)} className="text-xs text-accent-bright underline">Edit</button>
                    </div>
                  </>
                )}
                {detail.note_history.filter((history) => history.note_id === note.id).map((history, index) => (
                  <p key={`${history.edited_at}:${index}`} className="mt-2 border-t border-border pt-2 text-xs text-text-secondary">
                    Previous version · {history.editor_name ?? "Officer"} · {dateLabel(history.edited_at)}: {history.previous_body}
                  </p>
                ))}
              </li>
            ))}
            {detail.notes.length === 0 && <li className="text-sm text-text-secondary">No internal notes.</li>}
          </ul>
        </section>
      </section>
    </div>
  );
}

function ContentEditor({ content, refresh }: { content: ContentItem[]; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [questionsJson, setQuestionsJson] = useState("[]");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(item: ContentItem) {
    setSelected(item);
    setQuestionsJson(JSON.stringify(item.questions, null, 2));
    setMessage(null);
  }

  function createNew() {
    setSelected({
      id: "",
      slug: "",
      version: 1,
      content_type: "rule",
      title: "",
      body: "",
      required: true,
      status: "draft",
      verification_status: "verified",
      questions: [],
    });
    setQuestionsJson("[]");
    setMessage(null);
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    let questions: unknown;
    try {
      questions = JSON.parse(questionsJson);
      if (!Array.isArray(questions)) throw new Error("Questions must be a JSON array.");
    } catch (parseError) {
      setMessage(parseError instanceof Error ? parseError.message : "Questions JSON is invalid.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await apiPost<{ id: string }>("/api/command/content", {
      action: "save",
      id: selected.status === "draft" ? selected.id || undefined : undefined,
      slug: form.get("slug"),
      title: form.get("title"),
      content_type: form.get("content_type"),
      body: form.get("body"),
      required: form.get("required") === "on",
      verification_status: form.get("verification_status"),
      questions,
    });
    setBusy(false);
    if (result.error || !result.data) {
      setMessage(result.error ?? "Draft could not be saved.");
      return;
    }
    setMessage("Draft saved. Publish it when leadership approves the content.");
    await refresh();
    setSelected({
      ...selected,
      id: result.data.id,
      version: selected.status === "draft" && selected.id ? selected.version : selected.version + 1,
      status: "draft",
    });
  }

  async function publish() {
    if (!selected?.id) return;
    setBusy(true);
    const result = await apiPost("/api/command/content", { action: "publish", id: selected.id });
    setBusy(false);
    if (result.error) setMessage(result.error);
    else {
      setMessage("New version published. Members must acknowledge this version.");
      setSelected(null);
      await refresh();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(16rem,1fr)_2fr]">
      <section className="border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">Published and draft content</h2>
          <button onClick={createNew} className="border border-accent px-3 py-2 text-xs">New</button>
        </div>
        <ul className="mt-4 space-y-2">
          {content.filter((item) => item.status !== "retired").map((item) => (
            <li key={item.id}>
              <button onClick={() => choose(item)} className="w-full border border-border bg-bg p-3 text-left hover:border-accent">
                <span className="block text-sm">{item.title}</span>
                <small className="text-text-secondary">{item.content_type} · v{item.version} · {item.status}{item.verification_status === "leadership_review" ? " · review needed" : ""}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="border border-border bg-surface p-4 sm:p-6">
        {!selected ? (
          <p className="text-sm text-text-secondary">Select an item or create a new content draft.</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">Slug<input name="slug" required maxLength={100} defaultValue={selected.slug} className="mt-1 w-full border border-border bg-bg px-3 py-2" /></label>
              <label className="text-sm">Title<input name="title" required maxLength={160} defaultValue={selected.title} className="mt-1 w-full border border-border bg-bg px-3 py-2" /></label>
              <label className="text-sm">Type<select name="content_type" defaultValue={selected.content_type} className="mt-1 w-full border border-border bg-bg px-3 py-2"><option value="rule">Rule</option><option value="module">Training module</option><option value="announcement">Announcement</option></select></label>
              <label className="text-sm">Mechanics verification<select name="verification_status" defaultValue={selected.verification_status} className="mt-1 w-full border border-border bg-bg px-3 py-2"><option value="verified">Verified</option><option value="leadership_review">Leadership review required</option></select></label>
            </div>
            <label className="block text-sm">Training content<textarea name="body" required maxLength={30000} rows={8} defaultValue={selected.body} className="mt-1 w-full border border-border bg-bg px-3 py-2" /></label>
            <label className="flex items-center gap-2 text-sm"><input name="required" type="checkbox" defaultChecked={selected.required} />Required onboarding content</label>
            <label className="block text-sm">Quiz questions as JSON<textarea value={questionsJson} onChange={(event) => setQuestionsJson(event.target.value)} rows={10} className="mt-1 w-full border border-border bg-bg px-3 py-2 font-mono text-xs" /></label>
            {message && <p role="status" className="text-sm text-text-secondary">{message}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="border border-border px-4 py-2 text-sm disabled:opacity-50">{busy ? "Saving…" : "Save draft"}</button>
              <button type="button" disabled={busy || !selected.id || selected.status !== "draft"} onClick={() => void publish()} className="border border-accent bg-accent px-4 py-2 text-sm disabled:opacity-50">Publish version</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
