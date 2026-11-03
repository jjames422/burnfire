"use client";

import Link from "next/link";
import { useEffect, useState, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";

type Question = { id: string; slug: string; prompt: string; options: string[]; sort_order: number };
type AcademyItem = {
  id: string;
  slug: string;
  version: number;
  content_type: "rule" | "module";
  title: string;
  body: string;
  required: boolean;
  verification_status: "verified" | "leadership_review";
  progress_status: string;
  current_step: number;
  acknowledged_at: string | null;
  latest_quiz_passed: boolean | null;
  questions: Question[];
};
type AcademyData = {
  enrollment: {
    in_game_name: string;
    communication_preference: "external_chat" | "website" | "both" | null;
    alliance_mail_help: boolean | null;
    officer_interest: "yes" | "later" | "no" | null;
    current_step: number;
    completed_at: string | null;
    game_identifier: string | null;
  };
  content: AcademyItem[];
};
type QuizResult = {
  passed: boolean;
  correct_count: number;
  question_count: number;
  results: { id: string; correct: boolean; correct_index: number; explanation: string }[];
};

const panelClass = "border border-border bg-surface p-5 sm:p-7";
const buttonClass = "border border-border px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50";

export function RecruitAcademy() {
  const [data, setData] = useState<AcademyData | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameIdentifier, setGameIdentifier] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

  const modules = data?.content ?? [];
  const totalSteps = modules.length + 4;
  const activeModule = step >= 3 && step < 3 + modules.length ? modules[step - 3] : null;

  async function loadAcademy() {
    const result = await api<AcademyData>("/api/academy");
    setLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? "Academy data could not be loaded.");
      return;
    }
    setData(result.data);
    setGameIdentifier(result.data.enrollment.game_identifier ?? "");
    setStep(result.data.enrollment.current_step);
    setError(null);
  }

  useEffect(() => {
    void loadAcademy();
  }, []);

  async function moveTo(target: number) {
    setBusy(true);
    setError(null);
    if (target >= 3 && target < 3 + modules.length) {
      const item = modules[target - 3];
      const progress = await apiPost("/api/academy/progress", {
        slug: item.slug,
        current_step: target,
      });
      if (progress.error) {
        setBusy(false);
        setError(progress.error);
        return;
      }
    }
    const saved = await api("/api/academy/step", {
      method: "PATCH",
      body: JSON.stringify({ current_step: target }),
    });
    setBusy(false);
    if (saved.error) {
      setError(saved.error);
      return;
    }
    setStep(target);
    setAnswers({});
    setQuizResult(null);
  }

  async function savePreference(preference: "external_chat" | "website" | "both") {
    setBusy(true);
    const result = await api("/api/academy/preferences", {
      method: "PATCH",
      body: JSON.stringify({ communication_preference: preference }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setData((current) => current ? {
      ...current,
      enrollment: { ...current.enrollment, communication_preference: preference },
    } : current);
    await moveTo(3);
  }

  async function saveMailHelp(needsHelp: boolean) {
    setBusy(true);
    const result = await api("/api/academy/preferences", {
      method: "PATCH",
      body: JSON.stringify({ alliance_mail_help: needsHelp }),
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      setData((current) => current ? {
        ...current,
        enrollment: { ...current.enrollment, alliance_mail_help: needsHelp },
      } : current);
      setError(needsHelp ? "An R3 follow-up has been added. Use the alliance's in-game mail screen; the website cannot inspect it." : null);
    }
  }

  async function submitGameIdentifier(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const result = await api("/api/academy/identity", {
      method: "PATCH",
      body: JSON.stringify({ game_identifier: gameIdentifier.trim() }),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError("Game identifier submitted. An officer must verify it; the website does not connect to game data.");
    await moveTo(2);
  }

  async function submitQuiz(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeModule) return;
    setBusy(true);
    setError(null);
    const result = await apiPost<QuizResult>("/api/academy/quiz", {
      slug: activeModule.slug,
      answers,
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      setQuizResult(result.data);
      await loadAcademy();
    }
  }

  async function acknowledge(item: AcademyItem) {
    setBusy(true);
    const result = await apiPost<{ acknowledged: boolean }>("/api/academy/acknowledge", { slug: item.slug });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadAcademy();
  }

  async function requestHelp(item: AcademyItem) {
    setBusy(true);
    const result = await apiPost("/api/academy/progress", {
      slug: item.slug,
      current_step: step,
      needs_assistance: true,
    });
    setBusy(false);
    setError(result.error ?? "An officer follow-up has been created for this section.");
  }

  async function saveInterest(interest: "yes" | "later" | "no") {
    setBusy(true);
    const result = await api("/api/academy/preferences", {
      method: "PATCH",
      body: JSON.stringify({ officer_interest: interest }),
    });
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      setError(null);
      await loadAcademy();
    }
  }

  if (loading) return <p className="text-sm text-text-secondary">Loading your saved academy progress…</p>;
  if (!data) {
    return (
      <section className={panelClass}>
        <h1 className="font-display text-3xl font-semibold">Recruit Academy</h1>
        <p className="mt-3 text-sm text-text-secondary">{error ?? "Academy data could not be loaded."}</p>
        {error?.includes("invitation") && <Link href="/portal" className="mt-4 inline-block text-accent-bright underline">Apply to join the academy</Link>}
      </section>
    );
  }

  return (
    <div className="academy-workspace mx-auto max-w-4xl">
      <header className="mb-6">
        <span className="eyebrow">BurnFire · BF2</span>
        <h1 className="mt-2 font-display text-4xl font-semibold">Recruit Academy</h1>
        <p className="mt-2 text-sm text-text-secondary">Your progress is saved as you go. You can leave and resume from this step later.</p>
      </header>
      <div className="mb-5" aria-label={`Step ${Math.min(step + 1, totalSteps)} of ${totalSteps}`}>
        <div className="mb-2 flex justify-between text-xs text-text-secondary"><span>Orientation progress</span><span>Step {Math.min(step + 1, totalSteps)} of {totalSteps}</span></div>
        <div className="h-2 w-full bg-surface"><div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, ((step + 1) / totalSteps) * 100)}%` }} /></div>
      </div>
      {error && <p role="status" className="mb-4 border border-warning/40 bg-surface p-3 text-sm text-warning">{error}</p>}

      {step === 0 && (
        <section className={panelClass}>
          <span className="eyebrow">Step 1 · Welcome</span>
          <h2 className="mt-2 font-display text-3xl font-semibold">Welcome to BurnFire</h2>
          <p className="mt-3 leading-7 text-text-secondary">
            This guided orientation covers BF2 communication, conduct, server rules, diplomacy,
            cross-server policy, alliance positioning, participation, research, and ranks. Read each
            section, complete its knowledge check, and acknowledge the current version.
          </p>
          <p className="mt-3 text-sm text-text-secondary">You do not need to join an external chat server to complete any part of onboarding.</p>
          <button disabled={busy} onClick={() => void moveTo(1)} className={`mt-6 ${buttonClass}`}>Begin orientation</button>
        </section>
      )}

      {step === 1 && (
        <section className={panelClass}>
          <span className="eyebrow">Step 2 · Player identification</span>
          <h2 className="mt-2 font-display text-2xl font-semibold">Confirm your in-game identity</h2>
          <p className="mt-3 text-text-secondary">Profile name: <strong className="text-text-primary">{data.enrollment.in_game_name}</strong></p>
          <form onSubmit={submitGameIdentifier} className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary">In-game tag / player ID (required)</span>
              <input required value={gameIdentifier} onChange={(event) => setGameIdentifier(event.target.value)} minLength={2} maxLength={80} className="w-full border border-border bg-bg px-3 py-2" />
            </label>
            <p className="text-xs text-text-secondary">An identifier is only a self-submitted claim until an officer verifies it.</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || gameIdentifier.trim().length < 2} className={buttonClass}>{busy ? "Submitting…" : "Submit ID and continue"}</button>
            </div>
          </form>
        </section>
      )}

      {step === 2 && (
        <section className={panelClass}>
          <span className="eyebrow">Step 3 · Communication preference</span>
          <h2 className="mt-2 font-display text-2xl font-semibold">Which communication platform do you prefer?</h2>
          <p className="mt-3 text-sm text-text-secondary">External chat is encouraged, not mandatory. You may complete onboarding and receive website communications without joining it.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => void savePreference("external_chat")} className={buttonClass}>Discord</button>
            <button disabled={busy} onClick={() => void savePreference("website")} className={buttonClass}>BF2 Website</button>
            <button disabled={busy} onClick={() => void savePreference("both")} className={buttonClass}>Both</button>
          </div>
          {data.enrollment.communication_preference && <p className="mt-4 text-sm text-text-secondary">Saved preference: {data.enrollment.communication_preference === "external_chat" ? "Discord" : data.enrollment.communication_preference === "website" ? "BF2 Website" : "Both"}</p>}
        </section>
      )}

      {activeModule && (
        <section className={panelClass}>
          <span className="eyebrow">Step {step + 1} · {activeModule.content_type === "rule" ? "Official alliance rule" : "Required training"}</span>
          <h2 className="mt-2 font-display text-2xl font-semibold">{activeModule.title}</h2>
          {activeModule.verification_status === "leadership_review" && (
            <p className="mt-4 border border-warning/50 bg-bg p-3 text-sm text-warning">
              Game-interface navigation and eligibility mechanics in this section are awaiting leadership verification. Do not treat unverified navigation details as authoritative; ask an officer if uncertain.
            </p>
          )}
          {activeModule.slug === "rule-02-communication-platforms" && (
            <p className="mt-4 border border-tip/50 bg-bg p-3 text-sm text-text-secondary">
              Discord is optional. Website-based communication is an equal onboarding choice, and no member should be penalized for choosing it.
            </p>
          )}
          <div className="prose-guide mt-4 whitespace-pre-wrap text-sm text-text-secondary">{activeModule.body}</div>

          {activeModule.slug === "rule-03-alliance-mail" && (
            <fieldset className="mt-5 border border-border p-4">
              <legend className="px-2 text-sm font-medium">Do you know how to access alliance mail?</legend>
              <p className="mb-3 text-sm text-text-secondary">The site cannot detect whether in-game mail was opened. If you need help finding it, request an R3 follow-up.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void saveMailHelp(false)} className={buttonClass}>Yes, I know how</button>
                <button type="button" onClick={() => void saveMailHelp(true)} className={buttonClass}>No, I need assistance</button>
              </div>
            </fieldset>
          )}

          {activeModule.questions.length > 0 && (
            <form onSubmit={submitQuiz} className="mt-6 space-y-5 border-t border-border pt-5">
              <h3 className="font-display text-xl font-semibold">Knowledge check</h3>
              {activeModule.questions.map((question, index) => (
                <fieldset key={question.id} className="border border-border p-4">
                  <legend className="px-2 text-sm font-medium">{index + 1}. {question.prompt}</legend>
                  <div className="mt-2 space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label key={optionIndex} className="flex cursor-pointer items-start gap-2 text-sm text-text-secondary">
                        <input
                          required
                          type="radio"
                          name={question.id}
                          checked={answers[question.id] === optionIndex}
                          onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button disabled={busy} className={buttonClass}>{busy ? "Checking…" : "Submit knowledge check"}</button>
            </form>
          )}

          {quizResult && (
            <div role="status" className="mt-5 border border-border bg-bg p-4">
              <p className="font-medium">{quizResult.passed ? "Knowledge check passed" : "Knowledge check not passed"} · {quizResult.correct_count}/{quizResult.question_count}</p>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {quizResult.results.map((result) => (
                  <li key={result.id}>{result.correct ? "Correct" : `Review the correct option (${result.correct_index + 1})`} · {result.explanation}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
            {activeModule.acknowledged_at ? (
              <span className="text-sm text-tip">Version {activeModule.version} acknowledged {dateLabel(activeModule.acknowledged_at)}.</span>
            ) : (
              <button
                disabled={busy || (activeModule.questions.length > 0 && activeModule.latest_quiz_passed !== true && quizResult?.passed !== true)}
                onClick={() => void acknowledge(activeModule)}
                className={`${buttonClass} border-accent`}
              >
                I have read and understand this version
              </button>
            )}
            <button disabled={busy} onClick={() => void requestHelp(activeModule)} className={buttonClass}>I need officer help</button>
            {step > 0 && <button disabled={busy} onClick={() => void moveTo(step - 1)} className={buttonClass}>Previous</button>}
            <button disabled={busy || (activeModule.required && !activeModule.acknowledged_at)} onClick={() => void moveTo(Math.min(step + 1, totalSteps - 1))} className={buttonClass}>Continue to next section</button>
            <Link href="/portal" className={buttonClass}>Pause and return to portal</Link>
          </div>
        </section>
      )}

      {step === 3 + modules.length && (
        <section className={panelClass}>
          <span className="eyebrow">Final step · Orientation completion</span>
          <h2 className="mt-2 font-display text-2xl font-semibold">Would you be interested in becoming an R3 officer in the future?</h2>
          <p className="mt-3 text-sm text-text-secondary">This records interest only. It is not an application approval or automatic promotion.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void saveInterest("yes")} className={buttonClass}>Yes</button>
            <button disabled={busy} onClick={() => void saveInterest("later")} className={buttonClass}>Maybe later</button>
            <button disabled={busy} onClick={() => void saveInterest("no")} className={buttonClass}>No</button>
          </div>
          {data.enrollment.officer_interest && <p className="mt-4 text-sm text-text-secondary">Saved response: {data.enrollment.officer_interest === "later" ? "Maybe later" : data.enrollment.officer_interest === "yes" ? "Yes" : "No"}.</p>}
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm text-text-secondary">
              {data.enrollment.completed_at
                ? `Orientation complete as of ${dateLabel(data.enrollment.completed_at)}.`
                : `${modules.filter((item) => item.acknowledged_at).length} of ${modules.length} required sections acknowledged. Complete each knowledge check and acknowledgment to finish.`}
            </p>
          </div>
          <button disabled={busy} onClick={() => void moveTo(Math.max(0, step - 1))} className={`mt-5 ${buttonClass}`}>Review training</button>
        </section>
      )}

      {step > 0 && step < 3 + modules.length && (
        <button disabled={busy} onClick={() => void moveTo(step - 1)} className="mt-4 text-sm text-text-secondary underline">Previous step</button>
      )}
    </div>
  );
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
