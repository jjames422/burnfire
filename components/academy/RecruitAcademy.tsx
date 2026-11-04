"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";
import { ContentLanguageNote, type ContentLanguage } from "@/components/i18n/ContentLanguageNote";


import Link from "next/link";
import { useEffect, useState, type SubmitEvent } from "react";
import { api, apiPost } from "@/lib/api/client";

type Question = { id: string; slug: string; prompt: string; options: string[]; sort_order: number; localization?: ContentLanguage };
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
  localization?: ContentLanguage;
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
  results: { id: string; correct: boolean; correct_index: number; explanation: string; localization?: ContentLanguage }[];
};

const panelClass = "border border-border bg-surface p-5 sm:p-7";
const buttonClass = "border border-border px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-50";

export function RecruitAcademy() {
  const { t, locale } = useTranslation();
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
  const questionOffset = modules.slice(0, Math.max(0, step - 3))
    .reduce((count, item) => count + item.questions.length, 0);

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
    setError(t("Game identifier submitted. An officer must verify it; the website does not connect to game data."));
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

  if (loading) return <p className="text-sm text-text-secondary"><Text>{"Loading your saved academy progress…"}</Text></p>;
  if (!data) {
    return (
      <section className={panelClass}>
        <h1 className="font-display text-3xl font-semibold"><Text>{"Recruit Academy"}</Text></h1>
        <p className="mt-3 text-sm text-text-secondary">{error ?? t("Academy data could not be loaded.")}</p>
        {error?.includes("invitation") && <Link href="/portal" className="mt-4 inline-block text-accent-bright underline"><Text>{"Apply to join the academy"}</Text></Link>}
      </section>
    );
  }

  return (
    <div className="academy-workspace mx-auto max-w-4xl">
      <header className="mb-6">
        <span className="eyebrow"><Text>{"BurnFire · BF2"}</Text></span>
        <h1 className="mt-2 font-display text-4xl font-semibold"><Text>{"Recruit Academy"}</Text></h1>
        <p className="mt-2 text-sm text-text-secondary"><Text>{"Your progress is saved as you go. You can leave and resume from this step later."}</Text></p>
      </header>
      <div className="mb-5" aria-label={t("Step {value1} of {totalSteps}", { value1: Math.min(step + 1, totalSteps), totalSteps: totalSteps })}>
        <div className="mb-2 flex justify-between text-xs text-text-secondary"><span><Text>{"Orientation progress"}</Text></span><span><Text values={{ value1: String(Math.min(step + 1, totalSteps) ?? ""), totalSteps: totalSteps.toLocaleString(locale) }}>{"Step {value1}  of {totalSteps}"}</Text></span></div>
        <div className="h-2 w-full bg-surface"><div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, ((step + 1) / totalSteps) * 100)}%` }} /></div>
      </div>
      {error && <p role="status" className="mb-4 border border-warning/40 bg-surface p-3 text-sm text-warning">{t(error)}</p>}

      {step === 0 && (
        <section className={panelClass}>
          <span className="eyebrow"><Text>{"Step 1 · Welcome"}</Text></span>
          <h2 className="mt-2 font-display text-3xl font-semibold"><Text>{"Welcome to BurnFire"}</Text></h2>
          <p className="mt-3 leading-7 text-text-secondary">
            <Text>{"This guided orientation covers BF2 communication, conduct, server rules, diplomacy, cross-server policy, alliance positioning, participation, research, and ranks. Read each section, complete its knowledge check, and acknowledge the current version."}</Text></p>
          <p className="mt-3 text-sm text-text-secondary"><Text>{"You do not need to join an external chat server to complete any part of onboarding."}</Text></p>
          <button disabled={busy} onClick={() => void moveTo(1)} className={`mt-6 ${buttonClass}`}><Text>{"Begin orientation"}</Text></button>
        </section>
      )}

      {step === 1 && (
        <section className={panelClass}>
          <span className="eyebrow"><Text>{"Step 2 · Player identification"}</Text></span>
          <h2 className="mt-2 font-display text-2xl font-semibold"><Text>{"Confirm your in-game identity"}</Text></h2>
          <p className="mt-3 text-text-secondary"><Text>{"Profile name:"}</Text>{" "}<strong className="text-text-primary">{data.enrollment.in_game_name}</strong></p>
          <form onSubmit={submitGameIdentifier} className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-text-secondary"><Text>{"In-game tag / player ID (required)"}</Text></span>
              <input required value={gameIdentifier} onChange={(event) => setGameIdentifier(event.target.value)} minLength={2} maxLength={80} className="w-full border border-border bg-bg px-3 py-2" />
            </label>
            <p className="text-xs text-text-secondary"><Text>{"An identifier is only a self-submitted claim until an officer verifies it."}</Text></p>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || gameIdentifier.trim().length < 2} className={buttonClass}>{busy ? t("Submitting…") : t("Submit ID and continue")}</button>
            </div>
          </form>
        </section>
      )}

      {step === 2 && (
        <section className={panelClass}>
          <span className="eyebrow"><Text>{"Step 3 · Communication preference"}</Text></span>
          <h2 className="mt-2 font-display text-2xl font-semibold"><Text>{"Which communication platform do you prefer?"}</Text></h2>
          <p className="mt-3 text-sm text-text-secondary"><Text>{"External chat is encouraged, not mandatory. You may complete onboarding and receive website communications without joining it."}</Text></p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => void savePreference("external_chat")} className={buttonClass}><Text>{"Discord"}</Text></button>
            <button disabled={busy} onClick={() => void savePreference("website")} className={buttonClass}><Text>{"BF2 Website"}</Text></button>
            <button disabled={busy} onClick={() => void savePreference("both")} className={buttonClass}><Text>{"Both"}</Text></button>
          </div>
          {data.enrollment.communication_preference && <p className="mt-4 text-sm text-text-secondary"><Text>{"Saved preference:"}</Text>{" "}{data.enrollment.communication_preference === "external_chat" ? t("Discord") : data.enrollment.communication_preference === "website" ? t("BF2 Website") : t("Both")}</p>}
        </section>
      )}

      {activeModule && (
        <section className={panelClass}>
          <span className="eyebrow"><Text>{"Step"}</Text>{" "}{step + 1} · {activeModule.content_type === "rule" ? t("Official alliance rule") : t("Required training")}</span>
          <h2 lang={activeModule.localization?.locale} className="mt-2 font-display text-2xl font-semibold">{activeModule.title}</h2>
          <ContentLanguageNote localization={activeModule.localization} />
          {activeModule.verification_status === "leadership_review" && (
            <p className="mt-4 border border-warning/50 bg-bg p-3 text-sm text-warning">
              <Text>{"Game-interface navigation and eligibility mechanics in this section are awaiting leadership verification. Do not treat unverified navigation details as authoritative; ask an officer if uncertain."}</Text></p>
          )}
          {activeModule.slug === "rule-02-communication-platforms" && (
            <p className="mt-4 border border-tip/50 bg-bg p-3 text-sm text-text-secondary">
              <Text>{"Discord is optional. Website-based communication is an equal onboarding choice, and no member should be penalized for choosing it."}</Text></p>
          )}
          <div lang={activeModule.localization?.locale} className="prose-guide mt-4 whitespace-pre-wrap text-sm text-text-secondary">{activeModule.body}</div>

          {activeModule.slug === "rule-03-alliance-mail" && (
            <fieldset className="mt-5 border border-border p-4">
              <legend className="px-2 text-sm font-medium"><Text>{"Do you know how to access alliance mail?"}</Text></legend>
              <p className="mb-3 text-sm text-text-secondary"><Text>{"The site cannot detect whether in-game mail was opened. If you need help finding it, request an R3 follow-up."}</Text></p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void saveMailHelp(false)} className={buttonClass}><Text>{"Yes, I know how"}</Text></button>
                <button type="button" onClick={() => void saveMailHelp(true)} className={buttonClass}><Text>{"No, I need assistance"}</Text></button>
              </div>
            </fieldset>
          )}

          {activeModule.questions.length > 0 && (
            <form onSubmit={submitQuiz} className="mt-6 space-y-5 border-t border-border pt-5">
              <h3 className="font-display text-xl font-semibold"><Text>{"Knowledge check"}</Text></h3>
              {activeModule.questions.map((question, index) => (
                <fieldset key={question.id} lang={question.localization?.locale} className="border border-border p-4">
                  <legend className="px-2 text-sm font-medium">{questionOffset + index + 1}. {question.prompt}</legend>
                  <ContentLanguageNote localization={question.localization} />
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
              <button disabled={busy} className={buttonClass}>{busy ? t("Checking…") : t("Submit knowledge check")}</button>
            </form>
          )}

          {quizResult && (
            <div role="status" className="mt-5 border border-border bg-bg p-4">
              <p className="font-medium">{quizResult.passed ? t("Knowledge check passed") : t("Knowledge check not passed")} · {quizResult.correct_count}/{quizResult.question_count}</p>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                {quizResult.results.map((result) => (
                  <li key={result.id}>{result.correct ? t("Correct") : t("Review the correct option ({value1})", { value1: result.correct_index + 1 })} · <span lang={result.localization?.locale}>{result.explanation}</span><ContentLanguageNote localization={result.localization} /></li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-5">
            {activeModule.acknowledged_at ? (
              <span className="text-sm text-tip"><Text values={{ version: activeModule.version.toLocaleString(locale), value2: String(dateLabel(activeModule.acknowledged_at, locale) ?? "") }}>{"Version {version}  acknowledged {value2}."}</Text></span>
            ) : (
              <button
                disabled={busy || (activeModule.questions.length > 0 && activeModule.latest_quiz_passed !== true && quizResult?.passed !== true)}
                onClick={() => void acknowledge(activeModule)}
                className={`${buttonClass} border-accent`}
              >
                <Text>{"I have read and understand this version"}</Text></button>
            )}
            <button disabled={busy} onClick={() => void requestHelp(activeModule)} className={buttonClass}><Text>{"I need officer help"}</Text></button>
            {step > 0 && <button disabled={busy} onClick={() => void moveTo(step - 1)} className={buttonClass}><Text>{"Previous"}</Text></button>}
            <button disabled={busy || (activeModule.required && !activeModule.acknowledged_at)} onClick={() => void moveTo(Math.min(step + 1, totalSteps - 1))} className={buttonClass}><Text>{"Continue to next section"}</Text></button>
            <Link href="/portal" className={buttonClass}><Text>{"Pause and return to portal"}</Text></Link>
          </div>
        </section>
      )}

      {step === 3 + modules.length && (
        <section className={panelClass}>
          <span className="eyebrow"><Text>{"Final step · Orientation completion"}</Text></span>
          <h2 className="mt-2 font-display text-2xl font-semibold"><Text>{"Would you be interested in becoming an R3 officer in the future?"}</Text></h2>
          <p className="mt-3 text-sm text-text-secondary"><Text>{"This records interest only. It is not an application approval or automatic promotion."}</Text></p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void saveInterest("yes")} className={buttonClass}><Text>{"Yes"}</Text></button>
            <button disabled={busy} onClick={() => void saveInterest("later")} className={buttonClass}><Text>{"Maybe later"}</Text></button>
            <button disabled={busy} onClick={() => void saveInterest("no")} className={buttonClass}><Text>{"No"}</Text></button>
          </div>
          {data.enrollment.officer_interest && <p className="mt-4 text-sm text-text-secondary"><Text>{"Saved response:"}</Text>{" "}{data.enrollment.officer_interest === "later" ? t("Maybe later") : data.enrollment.officer_interest === "yes" ? t("Yes") : t("No")}.</p>}
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm text-text-secondary">
              {data.enrollment.completed_at
                ? t("Orientation complete as of {value1}.", { value1: dateLabel(data.enrollment.completed_at, locale) })
                : t("{completed} of {total} required sections acknowledged. Complete each knowledge check and acknowledgment to finish.", { completed: modules.filter((item) => item.acknowledged_at).length, total: modules.length })}
            </p>
          </div>
          <button disabled={busy} onClick={() => void moveTo(Math.max(0, step - 1))} className={`mt-5 ${buttonClass}`}><Text>{"Review training"}</Text></button>
        </section>
      )}

      {step > 0 && step < 3 + modules.length && (
        <button disabled={busy} onClick={() => void moveTo(step - 1)} className="mt-4 text-sm text-text-secondary underline"><Text>{"Previous step"}</Text></button>
      )}
    </div>
  );
}

function dateLabel(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}
