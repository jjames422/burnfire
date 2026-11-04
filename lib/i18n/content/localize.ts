import { createHash } from "node:crypto";
import type { Locale } from "../locales";

type SourceQuestion = [string, string, string[], number, string];
export type SourceSection = {
  slug: string;
  version: number;
  approved_versions?: number[];
  title: string;
  body: string;
  questions: SourceQuestion[];
};
export type TranslatedSection = {
  title: string;
  body: string;
  questions: Record<string, { prompt: string; options: string[]; explanation: string }>;
};
export type ContentCatalog = Record<string, TranslatedSection>;
export type TranslationManifest = Record<string, {
  source_hash: string;
  questions: Record<string, string>;
}>;
export type AcademyQuestionSource = {
  id: string;
  slug: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  sort_order: number;
};
type ContentSource = { slug: string; version: number; title: string; body: string };

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function contentSourceHash(content: ContentSource): string {
  return hash([content.slug, content.version, content.title, content.body]);
}

export function questionSourceHash(
  content: Pick<ContentSource, "slug" | "version">,
  question: Omit<AcademyQuestionSource, "id">,
): string {
  return hash([
    content.slug, content.version, question.slug, question.prompt,
    question.options, question.correct_index, question.explanation, question.sort_order,
  ]);
}

function metadata(requested: Locale, translated: boolean, sourceHash: string, version: number) {
  return {
    requested_locale: requested,
    locale: translated ? requested : "en",
    source_locale: "en",
    translated,
    fallback: requested !== "en" && !translated,
    source_hash: sourceHash,
    source_version: version,
  };
}

/**
 * Translation approval is bound to the exact English snapshot and version,
 * never to a slug alone. CMS revisions stay in English until reviewed.
 */
export function createAcademyLocalizer(
  source: SourceSection[],
  translations: Partial<Record<Locale, ContentCatalog>>,
  manifest: TranslationManifest,
) {
  const sections = new Set(source.map((section) => section.slug));

  function localizeContent<T extends ContentSource>(content: T, locale: Locale) {
    const translated = sections.has(content.slug) ? translations[locale]?.[content.slug] : undefined;
    const sourceHash = contentSourceHash(content);
    const approved = manifest[`${content.slug}@${content.version}`];
    const valid = locale !== "en" && !!translated &&
      !!approved && sourceHash === approved.source_hash;
    return {
      ...content,
      title: valid ? translated!.title : content.title,
      body: valid ? translated!.body : content.body,
      localization: metadata(locale, valid, sourceHash, content.version),
    };
  }

  function localizeQuestion(
    content: Pick<ContentSource, "slug" | "version">,
    question: AcademyQuestionSource,
    locale: Locale,
  ) {
    const translated = sections.has(content.slug)
      ? translations[locale]?.[content.slug]?.questions[question.slug] : undefined;
    const sourceHash = questionSourceHash(content, question);
    const approvedHash = manifest[`${content.slug}@${content.version}`]?.questions[question.slug];
    const valid = locale !== "en" && !!translated && sourceHash === approvedHash;
    return {
      id: question.id,
      slug: question.slug,
      prompt: valid ? translated!.prompt : question.prompt,
      options: valid ? [...translated!.options] : [...question.options],
      sort_order: question.sort_order,
      explanation: valid ? translated!.explanation : question.explanation,
      localization: metadata(locale, valid, sourceHash, content.version),
    };
  }

  function localizeTrainingSection<T extends ContentSource & { questions: AcademyQuestionSource[] }>(
    section: T,
    locale: Locale,
  ) {
    return {
      ...localizeContent(section, locale),
      questions: section.questions.map((question) => {
        const display = localizeQuestion(section, question, locale);
        // Only these fields may be sent before the quiz is submitted.
        return {
          id: display.id,
          slug: display.slug,
          prompt: display.prompt,
          options: display.options,
          sort_order: display.sort_order,
          localization: display.localization,
        };
      }),
    };
  }

  function localizeContentTitle(content: ContentSource, locale: Locale) {
    const { title, localization } = localizeContent(content, locale);
    return { title, localization };
  }

  return { localizeContent, localizeQuestion, localizeTrainingSection, localizeContentTitle };
}
