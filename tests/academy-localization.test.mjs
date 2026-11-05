import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import {
  createAcademyLocalizer, contentSourceHash, questionSourceHash,
} from "../lib/i18n/content/localize.ts";
import { scoreQuiz } from "../lib/academy/quiz-score.ts";

const locales = ["en", "ru", "fil", "fr", "zh-CN", "zh-TW", "ja", "es", "de", "ko", "pt", "ar", "sr-Latn", "sr-Cyrl", "bs", "hr"];
const source = JSON.parse(await readFile(new URL("../lib/i18n/content/en.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../lib/i18n/content/manifest.json", import.meta.url), "utf8"));
const catalogs = Object.fromEntries(await Promise.all(locales.filter((locale) => locale !== "en").map(async (locale) => [
  locale, JSON.parse(await readFile(new URL(`../lib/i18n/content/${locale}.json`, import.meta.url), "utf8")),
])));
const localizer = createAcademyLocalizer(source, catalogs, manifest);
function question(section, index = 0) {
  const [slug, prompt, options, correct_index, explanation] = section.questions[index];
  return { id: `persisted-question-${index}`, slug, prompt, options, correct_index, explanation, sort_order: index + 1 };
}

test("academy English snapshots faithfully match every schema seed field and quiz option order", async () => {
  const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const contentSeed = sql.slice(sql.indexOf("insert into academy_content\n"), sql.indexOf("insert into academy_questions\n"));
  const contents = [...contentSeed.matchAll(/\('([^']+)', (\d+), '(?:rule|module)', '((?:''|[^'])*)',\s*'((?:''|[^'])*)'/g)];
  assert.equal(contents.length, 13);
  for (const [, slug, version, title, body] of contents) {
    const section = source.find((entry) => entry.slug === slug);
    assert.ok(section, slug);
    assert.equal(section.version, Number(version));
    assert.equal(section.title, title.replaceAll("''", "'"));
    assert.equal(section.body, body.replaceAll("''", "'"));
  }
  const questionSeed = sql.slice(sql.indexOf("insert into academy_questions\n"));
  const questions = [...questionSeed.matchAll(/\('([^']+)', '([^']+)', '((?:''|[^'])*)',\s*'((?:''|[^'])*)', (\d+),\s*'((?:''|[^'])*)', (\d+)\)/g)];
  assert.equal(questions.length, 18);
  for (const [, sectionSlug, slug, prompt, options, answer, explanation, order] of questions) {
    const expected = question(source.find((entry) => entry.slug === sectionSlug), Number(order) - 1);
    assert.equal(expected.slug, slug);
    assert.equal(expected.prompt, prompt.replaceAll("''", "'"));
    assert.deepEqual(expected.options, JSON.parse(options.replaceAll("''", "'")));
    assert.equal(expected.correct_index, Number(answer));
    assert.equal(expected.explanation, explanation.replaceAll("''", "'"));
  }
});

test("all eleven translations cover every title, policy, question, option, and explanation", () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    assert.equal(Object.keys(catalog).length, source.length, locale);
    source.forEach((section) => {
      const { title, body, questions } = catalog[section.slug];
      assert.ok(title.trim() && body.trim(), locale);
      assert.notEqual(title, section.title, locale);
      assert.notEqual(body, section.body, locale);
      assert.equal(Object.keys(questions).length, section.questions.length, locale);
      section.questions.forEach(([slug], qi) => {
        const { prompt, options, explanation } = questions[slug];
        assert.ok(prompt.trim() && explanation.trim(), locale);
        assert.notEqual(prompt, section.questions[qi][1], locale);
        assert.notEqual(explanation, section.questions[qi][4], locale);
        assert.equal(options.length, section.questions[qi][2].length, locale);
        assert.ok(options.every((option) => typeof option === "string" && option.trim()), locale);
      });
    });
  }
});

test("stored SHA-256 approvals match each approved source and current read-only verified v2 snapshots", () => {
  for (const section of source) {
    for (const version of section.approved_versions ?? [section.version]) {
      const current = { ...section, version };
      const approved = manifest[`${section.slug}@${version}`];
      assert.equal(approved.source_hash, contentSourceHash(current));
      section.questions.forEach((_, index) => {
        const q = question(section, index);
        assert.equal(approved.questions[q.slug], questionSourceHash(current, q));
        for (const locale of Object.keys(catalogs)) {
          assert.equal(localizer.localizeContent(current, locale).localization.locale, locale);
          assert.equal(localizer.localizeQuestion(current, q, locale).localization.locale, locale);
        }
      });
    }
  }
  assert.equal(Object.keys(manifest).length, 15);
});

test("CMS edits to source text or versions never reuse stale display translations", () => {
  const original = source[0];
  for (const changed of [
    { ...original, title: "New title" },
    { ...original, body: "A revised policy that must not be hidden" },
    { ...original, version: original.version + 1 },
    { ...original, slug: "newly-authored-announcement" },
  ]) {
    const display = localizer.localizeContent(changed, "ar");
    assert.equal(display.title, changed.title);
    assert.equal(display.body, changed.body);
    assert.deepEqual(display.localization, {
      requested_locale: "ar", locale: "en", source_locale: "en", translated: false,
      fallback: true, source_hash: contentSourceHash(changed), source_version: changed.version,
    });
  }
  const english = localizer.localizeContent(original, "en");
  assert.equal(english.body, original.body);
  assert.equal(english.localization.fallback, false);
});

test("question revisions, reordered answers, scoring changes and new versions fall back to explicit English", () => {
  const section = source[0];
  const original = question(section);
  for (const changed of [
    { ...original, prompt: "New prompt" },
    { ...original, options: [...original.options].reverse() },
    { ...original, explanation: "Revised feedback" },
    { ...original, correct_index: 2 },
    { ...original, sort_order: 2 },
    { ...original, slug: "new-question" },
  ]) {
    const display = localizer.localizeQuestion(section, changed, "ja");
    assert.equal(display.prompt, changed.prompt);
    assert.equal(display.explanation, changed.explanation);
    assert.deepEqual(display.options, changed.options);
    assert.equal(display.localization.locale, "en");
    assert.equal(display.localization.fallback, true);
  }
  assert.equal(localizer.localizeQuestion({ ...section, version: 99 }, original, "ja").localization.locale, "en");
});

test("localization never changes persisted identifiers, option order, or exposes quiz answers", () => {
  const section = source[4];
  const original = question(section, 1);
  const before = JSON.stringify(original);
  const display = localizer.localizeQuestion(section, original, "fr");
  assert.equal(display.id, original.id);
  assert.equal(display.slug, original.slug);
  assert.equal(display.sort_order, original.sort_order);
  assert.equal("correct_index" in display, false);
  assert.deepEqual(display.options, catalogs.fr[section.slug].questions[original.slug].options);
  assert.equal(JSON.stringify(original), before);
  assert.equal(display.localization.source_hash, questionSourceHash(section, original));
});

test("display localization leaves the complete quiz scoring and stored answer set unchanged", () => {
  for (const section of source) {
    const questions = section.questions.map((_, index) => question(section, index));
    const answers = Object.fromEntries(questions.map((entry) => [entry.id, entry.correct_index]));
    const originalScore = scoreQuiz(questions, answers);
    for (const locale of Object.keys(catalogs)) {
      for (const entry of questions) localizer.localizeQuestion(section, entry, locale);
      assert.deepEqual(scoreQuiz(questions, answers), originalScore, `${section.slug}: ${locale}`);
      assert.equal(originalScore.passed, true);
    }
  }
});

test("academy GET display boundary never serializes correct answers or quiz explanations", async () => {
  const route = await readFile(new URL("../app/api/academy/route.ts", import.meta.url), "utf8");
  assert.match(route, /content:\s*content\.map\(\(section\) => localizeTrainingSection\(section, locale\)\)/);
  for (const section of source) {
    const questions = section.questions.map((_, index) => question(section, index));
    const row = { ...section, id: "stored-content-id", questions, acknowledged_at: "unchanged" };
    for (const locale of locales) {
      const payload = JSON.parse(JSON.stringify(localizer.localizeTrainingSection(row, locale)));
      assert.equal(payload.id, row.id);
      assert.equal(payload.acknowledged_at, row.acknowledged_at);
      assert.equal(payload.questions.length, questions.length);
      payload.questions.forEach((display, index) => {
        assert.deepEqual(Object.keys(display).sort(), ["id", "slug", "prompt", "options", "sort_order", "localization"].sort());
        assert.equal(display.id, questions[index].id);
        for (const field of ["correct_index", "correct", "answers", "explanation"]) {
          assert.equal(Object.hasOwn(display, field), false, `${section.slug}: ${locale}: ${field}`);
        }
      });
    }
  }
});

test("command display titles require complete current source and retain explicit fallback metadata", () => {
  const section = source[0];
  assert.deepEqual(localizer.localizeContentTitle(section, "fr"), {
    title: catalogs.fr[section.slug].title,
    localization: localizer.localizeContent(section, "fr").localization,
  });
  const changed = { ...section, body: "New policy text" };
  const display = localizer.localizeContentTitle(changed, "fr");
  assert.equal(display.title, section.title);
  assert.equal(display.localization.locale, "en");
  assert.equal(display.localization.fallback, true);
});

test("all message dictionaries are complete source-keyed translations with intact templates", async () => {
  const dictionaries = Object.fromEntries(await Promise.all(locales.map(async (locale) => [
    locale, JSON.parse(await readFile(new URL(`../lib/i18n/messages/${locale}.json`, import.meta.url), "utf8")),
  ])));
  const keys = Object.keys(dictionaries.en).sort();
  assert.ok(keys.length >= 166);
  const placeholders = (text) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
  for (const locale of locales) {
    const dictionary = dictionaries[locale];
    assert.equal(Array.isArray(dictionary), false);
    assert.deepEqual(Object.keys(dictionary).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(dictionary[key].trim(), `${locale}: ${key}`);
      assert.deepEqual(placeholders(dictionary[key]), placeholders(key), `${locale}: ${key}`);
      if (locale !== "en") assert.notEqual(dictionary[key], key, `${locale}: ${key}`);
    }
  }
});

test("known server/API errors, database fallbacks and exceptions all have stored translations", async () => {
  const dictionary = JSON.parse(await readFile(new URL("../lib/i18n/messages/en.json", import.meta.url), "utf8"));
  for (const root of ["lib/server", "app/api"]) {
    const directory = new URL(`../${root}/`, import.meta.url);
    for (const path of (await readdir(directory, { recursive: true })).filter((path) => path.endsWith(".ts"))) {
      const source = await readFile(new URL(path, directory), "utf8");
      for (const match of source.matchAll(/(?:jsonError\(|throw new Error\(|error:\s*|message:\s*)(["'`])((?:(?!\1)[\s\S])*?)\1/g)) {
        assert.ok(Object.hasOwn(dictionary, match[2]), `${root}/${path}: ${match[2]}`);
      }
      for (const match of source.matchAll(/databaseErrorMessage\(\s*error,\s*"([^"]+)"/g)) {
        assert.ok(Object.hasOwn(dictionary, match[1]), `${root}/${path}: ${match[1]}`);
      }
    }
  }
  const sql = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  for (const [, message] of sql.matchAll(/raise exception '([^']+)'/gi)) {
    assert.ok(Object.hasOwn(dictionary, message), message);
  }
});
