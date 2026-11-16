#!/usr/bin/env node
// Translates English guides into every site locale whose translation is
// missing or stale (its manifest hash no longer matches the English source).
//
//   node scripts/translate-guides.mjs [--slug <slug>] [--locale <locale>]
//                                     [--dry-run] [--summary <file>]
//
// Each translation is validated before it is written (stable frontmatter,
// same sections, links, components, and it must compile as MDX); a failing
// translation is retried with the problems fed back. The manifest hash is
// only recorded for translations that pass, so anything that fails keeps
// falling back to English on the site. `npm test` remains the final gate.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(root, "content/burnfire");
const sourceDir = path.join(contentDir, "guides");
const localesDir = path.join(contentDir, "locales");

// Google Gemini through its OpenAI-compatible Chat Completions endpoint, the
// same provider the BurnFire universal translator bot uses.
const API_BASE_URL = process.env.TRANSLATION_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY;
// Tried in order: when a model is overloaded (503) or out of free-tier quota
// (429), the next one is used. Every result is validated either way.
const MODELS = (process.env.TRANSLATION_MODELS || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",").map((model) => model.trim()).filter(Boolean);
const MAX_ATTEMPTS = 3; // translation attempts, each validated
const TRIES_PER_MODEL = 3; // for overload, rate limits and network errors
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const CONCURRENCY = 2;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Guide whose existing translations show each locale's established game terms.
const GLOSSARY_GUIDE = "alliance-duel";
const STABLE_FIELDS = ["slug", "tags", "alliance", "author", "authorRank", "publishedAt", "updatedAt", "draft", "heroImage"];

const KEEP_ENGLISH_TERMS =
  "Keep in-game feature, event, building, item and resource names in English (Latin script), exactly as the English guide writes them, matching how this locale's existing guides do it.";
const LOCALES = {
  ru: { name: "Russian" },
  fil: { name: "Filipino (Tagalog)", notes: `${KEEP_ENGLISH_TERMS} Natural Filipino gamer register; English loanwords are fine where players use them.` },
  fr: { name: "French", notes: "Use French typographic spacing before : ; ! ? and » « where the existing guides do." },
  "zh-CN": { name: "Simplified Chinese (Mainland)" },
  "zh-TW": { name: "Traditional Chinese (Taiwan usage, e.g. 伺服器, 週)" },
  ja: { name: "Japanese" },
  es: { name: "Spanish" },
  de: { name: "German" },
  ko: { name: "Korean" },
  pt: { name: "Portuguese (Brazilian)" },
  ar: { name: "Modern Standard Arabic" },
  "sr-Latn": { name: "Serbian, Latin script (ekavian)", notes: KEEP_ENGLISH_TERMS },
  "sr-Cyrl": { name: "Serbian, Cyrillic script (ekavian)", notes: `${KEEP_ENGLISH_TERMS} All Serbian prose must be in Cyrillic; only those English names stay in Latin script. Never mix Latin letters into a Cyrillic word.` },
  bs: { name: "Bosnian (ijekavian, Latin script)", notes: `${KEEP_ENGLISH_TERMS} Use Bosnian vocabulary (e.g. sedmica).` },
  hr: { name: "Croatian (ijekavian)", notes: `${KEEP_ENGLISH_TERMS} Use Croatian vocabulary (e.g. tjedan, poslužitelj).` },
};

const SYSTEM_PROMPT = `You translate strategy guides for BurnFire (BF2), an alliance in the mobile game Last Asylum: Plague, for the alliance's website. Readers are alliance members who play the game in their own language.

You receive one English MDX guide and return the complete translated MDX file - nothing before or after it, no code fences.

Rules:
- Frontmatter: translate only \`title\` and \`summary\`. Copy every other field (slug, tags, heroImage, author, publishedAt, updatedAt, alliance, draft, authorRank) byte-for-byte. The title must differ from the English title.
- Keep the MDX structure exactly: the same headings (\`##\`, \`###\`) in the same order, the same tables with the same number of rows and columns, the same lists, the same \`---\` rules, and the same bold markers on equivalent words.
- MDX components (<Figure>, <Callout>, ...): keep every component, attribute name, and non-text attribute value (src, width, height, variant). Translate only human-readable text: \`alt\`, \`caption\`, \`title\` and the text between tags. Escape nothing new; never put a raw double quote inside an attribute value.
- Links: keep every URL and path exactly; translate only the link text.
- Keep every number, time, temperature, percentage, level (Lv.6) and date exactly. Use the locale's normal number formatting only where the existing translations do.
- Hero names (Arthur, Red Lady, Zoya, ...), player names, server/kingdom numbers, and IDs stay as written.
- The final "Credit:" line: translate its labels (Credit, Server, Kingdom, Character ID) the way the reference translation does, keep the values.
- Reuse the terminology in the reference translations you are given, so event phases, items and features are named the same way across the site.
- Write naturally for a native-speaking player, not word-for-word. Keep the guide's direct, practical tone.`;

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readManifest(locale) {
  const raw = await readOptional(path.join(localesDir, locale, "manifest.json"));
  return raw ? JSON.parse(raw) : { guides: {} };
}

async function writeManifest(locale, manifest) {
  await writeFile(path.join(localesDir, locale, "manifest.json"), `${JSON.stringify(manifest)}\n`);
}

const headingCount = (text, prefix) => text.split("\n").filter((line) => line.startsWith(prefix)).length;
const destinations = (text) => [...text.matchAll(/(?:src="|href="|\]\()([^")]+)["\)]/g)].map((m) => m[1]).sort();
const components = (text) => [...text.matchAll(/<([A-Z][A-Za-z]*)\b/g)].map((m) => m[1]).sort();
const tableRows = (text) => text.split("\n").filter((line) => line.startsWith("|")).length;
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Returns the problems with a translation; an empty list means it passes. */
export async function validate(sourceRaw, translatedRaw, locale) {
  const problems = [];
  let source, translated;
  try {
    source = matter(sourceRaw);
    translated = matter(translatedRaw);
  } catch (error) {
    return [`frontmatter does not parse: ${error.message}`];
  }
  for (const field of STABLE_FIELDS) {
    if (!sameList(translated.data[field], source.data[field])) problems.push(`frontmatter field "${field}" must be copied unchanged from the English`);
  }
  if (!translated.data.title || translated.data.title === source.data.title) problems.push("title must be translated");
  if (!translated.data.summary || translated.data.summary === source.data.summary) problems.push("summary must be translated");
  if (translated.content.trim() === source.content.trim()) problems.push("body was not translated");
  for (const prefix of ["## ", "### "]) {
    const [want, got] = [headingCount(source.content, prefix), headingCount(translated.content, prefix)];
    if (want !== got) problems.push(`expected ${want} "${prefix.trim()}" headings, found ${got}`);
  }
  if (!sameList(destinations(translated.content), destinations(source.content))) problems.push("image sources and link destinations must match the English exactly");
  if (!sameList(components(translated.content), components(source.content))) problems.push("MDX components must match the English (same components, same count)");
  if (tableRows(translated.content) !== tableRows(source.content)) problems.push(`expected ${tableRows(source.content)} table lines, found ${tableRows(translated.content)}`);
  if (locale === "sr-Cyrl") {
    const mixed = translated.content.match(/\p{Script=Cyrillic}+[A-Za-z]+\p{Script=Cyrillic}*|[A-Za-z]+\p{Script=Cyrillic}+/gu);
    if (mixed) problems.push(`words mix Latin and Cyrillic letters: ${[...new Set(mixed)].slice(0, 10).join(", ")}`);
  }
  try {
    await serialize(translated.content, { mdxOptions: { remarkPlugins: [remarkGfm] } });
  } catch (error) {
    const detail = error.message.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4).join(" ");
    problems.push(`MDX does not compile: ${detail.slice(0, 500)}`);
  }
  return problems;
}

function stripFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[a-z]*\n([\s\S]*?)\n```$/);
  return `${(fenced ? fenced[1] : trimmed).trimEnd()}\n`;
}

async function buildReferences(locale, slug) {
  const parts = [];
  const englishGlossary = await readOptional(path.join(sourceDir, `${GLOSSARY_GUIDE}.mdx`));
  const localGlossary = await readOptional(path.join(localesDir, locale, "guides", `${GLOSSARY_GUIDE}.mdx`));
  if (slug !== GLOSSARY_GUIDE && englishGlossary && localGlossary) {
    parts.push(`<reference_english guide="${GLOSSARY_GUIDE}">\n${englishGlossary}\n</reference_english>`);
    parts.push(`<reference_translation guide="${GLOSSARY_GUIDE}">\n${localGlossary}\n</reference_translation>`);
  }
  const previous = await readOptional(path.join(localesDir, locale, "guides", `${slug}.mdx`));
  if (previous) {
    parts.push(`<previous_translation guide="${slug}">\nThis translates an earlier version of the same guide. Keep its wording wherever the English did not change; update only what changed.\n\n${previous}\n</previous_translation>`);
  }
  return parts.join("\n\n");
}

/** Thrown for failures that retrying the same model will not fix. */
class ModelUnavailable extends Error {}

async function completeWith(model, messages) {
  const url = new URL("chat/completions", API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`);
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt >= TRIES_PER_MODEL) throw new ModelUnavailable(`${model}: request failed (${error.message})`);
      await sleep(5000 * attempt);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt >= TRIES_PER_MODEL) throw new ModelUnavailable(`${model}: HTTP ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after")) || 0;
      await sleep(Math.min(Math.max(retryAfter * 1000, 5000 * attempt), 60_000));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`${model}: HTTP ${response.status}: ${detail}`);
    }
    const body = await response.json();
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === "length") throw new ModelUnavailable(`${model}: output was cut off at the model's output limit`);
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ModelUnavailable(`${model}: returned no text (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
    }
    return content;
  }
}

/** One chat completion, falling through MODELS until one answers. */
async function complete(messages) {
  const reasons = [];
  for (const model of MODELS) {
    try {
      return { text: await completeWith(model, messages), model };
    } catch (error) {
      if (!(error instanceof ModelUnavailable)) throw error;
      reasons.push(error.message);
      console.warn(`  ${error.message}; trying the next model`);
    }
  }
  throw new Error(`no model available: ${reasons.join("; ")}`);
}

async function translate({ slug, locale, sourceRaw }) {
  const { name, notes } = LOCALES[locale];
  const references = await buildReferences(locale, slug);
  const request =
    `${references}\n\nTranslate this guide into ${name} (site locale "${locale}").` +
    (notes ? `\nLocale notes: ${notes}` : "") +
    `\n\n<english_guide slug="${slug}">\n${sourceRaw}\n</english_guide>`;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: request },
  ];

  let lastProblems = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { text, model } = await complete(messages);
    const candidate = stripFences(text);
    lastProblems = await validate(sourceRaw, candidate, locale);
    if (lastProblems.length === 0) return { mdx: candidate, attempts: attempt, model };

    console.warn(`  ${locale}/${slug} attempt ${attempt} failed checks: ${lastProblems.join("; ")}`);
    messages.push({ role: "assistant", content: text });
    messages.push({
      role: "user",
      content: `That translation fails these checks:\n- ${lastProblems.join("\n- ")}\n\nReturn the complete corrected MDX file only.`,
    });
  }
  throw new Error(`failed checks after ${MAX_ATTEMPTS} attempts: ${lastProblems.join("; ")}`);
}

async function runPool(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      locale: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      summary: { type: "string" },
    },
  });
  if (values.slug && !SLUG_PATTERN.test(values.slug)) throw new Error(`Invalid slug: ${values.slug}`);
  if (values.locale && !LOCALES[values.locale]) throw new Error(`Unknown locale: ${values.locale}. Known: ${Object.keys(LOCALES).join(", ")}`);

  const slugs = (await readdir(sourceDir))
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.slice(0, -4))
    .filter((slug) => SLUG_PATTERN.test(slug) && (!values.slug || slug === values.slug))
    .sort();
  if (values.slug && slugs.length === 0) throw new Error(`No English guide named ${values.slug}`);
  const locales = values.locale ? [values.locale] : Object.keys(LOCALES);

  const manifests = Object.fromEntries(await Promise.all(locales.map(async (l) => [l, await readManifest(l)])));
  const jobs = [];
  for (const slug of slugs) {
    const sourceRaw = await readFile(path.join(sourceDir, `${slug}.mdx`), "utf8");
    const hash = sha256(sourceRaw);
    for (const locale of locales) {
      const fileExists = (await readOptional(path.join(localesDir, locale, "guides", `${slug}.mdx`))) !== null;
      if (fileExists && manifests[locale].guides?.[slug] === hash) continue;
      jobs.push({ slug, locale, sourceRaw, hash, reason: fileExists ? "stale" : "missing" });
    }
  }

  if (jobs.length === 0) {
    console.log("All guide translations are up to date.");
    if (values.summary) await writeFile(values.summary, "All guide translations are up to date.\n");
    return;
  }
  console.log(`${jobs.length} translation(s) needed:`);
  for (const job of jobs) console.log(`  ${job.locale}/${job.slug} (${job.reason})`);
  if (values["dry-run"]) return;
  if (!API_KEY) throw new Error("Set GEMINI_API_KEY (the Gemini key the universal translator bot uses).");

  const done = [];
  const failed = [];
  await runPool(jobs, CONCURRENCY, async (job) => {
    try {
      const { mdx, attempts, model } = await translate(job);
      await mkdir(path.join(localesDir, job.locale, "guides"), { recursive: true });
      await writeFile(path.join(localesDir, job.locale, "guides", `${job.slug}.mdx`), mdx);
      manifests[job.locale].guides ??= {};
      manifests[job.locale].guides[job.slug] = job.hash;
      done.push({ ...job, attempts, model, title: matter(mdx).data.title });
      console.log(`  ok   ${job.locale}/${job.slug} via ${model}${attempts > 1 ? ` (after ${attempts} attempts)` : ""}`);
    } catch (error) {
      failed.push({ ...job, error: error.message });
      console.error(`  FAIL ${job.locale}/${job.slug}: ${error.message}`);
    }
  });
  // Written once, after all jobs, so parallel jobs never write the same file.
  for (const locale of new Set(done.map((job) => job.locale))) await writeManifest(locale, manifests[locale]);

  if (values.summary) {
    const bySlug = (list) => [...new Set(list.map((job) => job.slug))].sort();
    const lines = [];
    for (const slug of bySlug(done)) {
      lines.push(`### \`${slug}\``, "", "| Locale | Title | Model |", "| --- | --- | --- |");
      for (const job of done.filter((j) => j.slug === slug).sort((a, b) => a.locale.localeCompare(b.locale))) {
        lines.push(`| ${job.locale} | ${job.title.replaceAll("|", "\\|")} | ${job.model} |`);
      }
      lines.push("");
    }
    if (failed.length) {
      lines.push("### Failed (still showing English on the site)", "");
      for (const job of failed) lines.push(`- \`${job.locale}/${job.slug}\`: ${job.error}`);
      lines.push("");
    }
    await writeFile(values.summary, lines.join("\n"));
  }

  console.log(`\n${done.length} translated, ${failed.length} failed.`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
