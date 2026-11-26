#!/usr/bin/env node
// Fills interface strings that `npm run check:localization` reports as
// missing, using the same Gemini endpoint and model fallback as
// translate-guides.mjs. Each batch is validated (same keys, same {placeholders},
// non-empty) before anything is written; failures are left for a rerun.
//
//   GEMINI_API_KEY=... node scripts/translate-ui.mjs [--locale fr] [--dry-run]
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE_URL = process.env.TRANSLATION_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
const API_KEY = process.env.GEMINI_API_KEY;
const MODELS = (process.env.TRANSLATION_MODELS || "gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
const BATCH = 60;
const LOCALES = {
  ru: "Russian", fil: "Filipino (Tagalog), natural gamer register", fr: "French (typographic spacing before : ; ! ?)",
  "zh-CN": "Simplified Chinese", "zh-TW": "Traditional Chinese (Taiwan usage)", ja: "Japanese", es: "Spanish", de: "German",
  ko: "Korean", pt: "Portuguese (Brazilian)", ar: "Modern Standard Arabic", "sr-Latn": "Serbian, Latin script (ekavian)",
  "sr-Cyrl": "Serbian, Cyrillic script (ekavian); never mix Latin letters into Cyrillic words", bs: "Bosnian (ijekavian, Latin)", hr: "Croatian (ijekavian)",
};
const SYSTEM = `You translate short interface strings for BurnFire (BF2), an alliance website for the mobile game Last Asylum: Plague. The screens are an alliance statistics dashboard, kingdom rankings, leadership tools, and an integration admin page.

Return only a JSON object mapping each English key to its translation. Rules:
- Keep every {placeholder} exactly, including its name.
- Keep these as written: BurnFire, BF2, R4, R5, KvK, NAP, ID, UTC, API, Patreon, LAT_API_KEY, api.lastasylumtracker.com, MB, KB, and alliance tags in brackets.
- Short labels stay short (they sit in table headers and buttons). Uppercase English labels stay uppercase where the script has case.
- "Power" is the game's power stat; "Sanctuary" is a game building level; "honor" and "tech donations" are game contribution counters. Use the terms players of this game use in the language.
- Be precise and neutral. Inactivity text must not sound accusatory.`;

const { values: args } = parseArgs({ options: { locale: { type: "string" }, "dry-run": { type: "boolean" }, messages: { type: "boolean" } } });

/** Server/API messages (same pattern as tests/academy-localization.test.mjs) missing from messages/en.json. */
async function missingMessages() {
  const { readdir } = await import("node:fs/promises");
  const english = JSON.parse(await readFile(path.join(root, "lib/i18n/messages/en.json"), "utf8"));
  const found = new Set();
  for (const folder of ["lib/server", "app/api"]) {
    for (const file of (await readdir(path.join(root, folder), { recursive: true })).filter((name) => name.endsWith(".ts"))) {
      const source = await readFile(path.join(root, folder, file), "utf8");
      for (const match of source.matchAll(/(?:jsonError\(|throw new Error\(|error:\s*|message:\s*)(["'`])((?:(?!\1)[\s\S])*?)\1/g)) found.add(match[2]);
      // Provider error maps returned through jsonError(map[code]).
      for (const match of source.matchAll(/^\s+[a-z_]+: "([A-Z][^"]+)",$/gm)) if (/Messages/.test(source)) found.add(match[1]);
    }
  }
  const keys = [...found].filter((key) => !Object.hasOwn(english, key) && !key.includes("${"));
  if (!args["dry-run"] && keys.length) {
    for (const key of keys) english[key] = key;
    await writeFile(path.join(root, "lib/i18n/messages/en.json"), `${JSON.stringify(english, null, 2)}\n`);
  }
  const englishKeys = Object.keys(english);
  const byLocale = new Map();
  for (const locale of Object.keys(LOCALES)) {
    const dictionary = JSON.parse(await readFile(path.join(root, "lib/i18n/messages", `${locale}.json`), "utf8"));
    byLocale.set(locale, new Set(englishKeys.filter((key) => !Object.hasOwn(dictionary, key))));
  }
  return byLocale;
}

function missing() {
  let output = "";
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", "scripts/check-localization.mjs"], { cwd: root, stdio: "pipe" });
  } catch (error) {
    output = String(error.stderr ?? "") + String(error.stdout ?? "");
  }
  const byLocale = new Map();
  for (const match of output.matchAll(/: ([A-Za-z-]+) lacks (".*")$/gm)) {
    const [, locale, quoted] = match;
    if (!byLocale.has(locale)) byLocale.set(locale, new Set());
    byLocale.get(locale).add(JSON.parse(quoted));
  }
  return byLocale;
}

const placeholders = (text) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort().join(",");

async function complete(messages) {
  const url = new URL("chat/completions", API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`);
  const reasons = [];
  for (const model of MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
          signal: AbortSignal.timeout(180_000),
        });
      } catch (error) { reasons.push(`${model}: ${error.message}`); await sleep(4000 * attempt); continue; }
      if (response.status === 429 || response.status >= 500) { reasons.push(`${model}: HTTP ${response.status}`); await sleep(6000 * attempt); continue; }
      if (!response.ok) throw new Error(`${model}: HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const content = (await response.json())?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) return content;
      reasons.push(`${model}: empty answer`);
      break;
    }
  }
  throw new Error(`no model available: ${reasons.slice(-4).join("; ")}`);
}

async function translateBatch(locale, keys) {
  const raw = await complete([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Target language: ${LOCALES[locale]}\n\n${JSON.stringify(Object.fromEntries(keys.map((key) => [key, key])), null, 1)}` },
  ]);
  const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  const accepted = {};
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim() && placeholders(value) === placeholders(key) && (!args.messages || value.trim() !== key)) accepted[key] = value.trim();
  }
  return accepted;
}

async function main() {
  if (!API_KEY) throw new Error("Set GEMINI_API_KEY (the Gemini key the universal translator bot uses).");
  const work = args.messages ? await missingMessages() : missing();
  let written = 0;
  let failed = 0;
  for (const [locale, keySet] of work) {
    if (args.locale && args.locale !== locale) continue;
    if (!LOCALES[locale]) continue;
    const keys = [...keySet];
    const file = path.join(root, "lib/i18n", args.messages ? "messages" : "ui", `${locale}.json`);
    const dictionary = JSON.parse(await readFile(file, "utf8"));
    for (let index = 0; index < keys.length; index += BATCH) {
      const batch = keys.slice(index, index + BATCH);
      try {
        const accepted = await translateBatch(locale, batch);
        Object.assign(dictionary, accepted);
        written += Object.keys(accepted).length;
        failed += batch.length - Object.keys(accepted).length;
        console.log(`${locale}: batch ${index / BATCH + 1} accepted ${Object.keys(accepted).length}/${batch.length}`);
      } catch (error) {
        failed += batch.length;
        console.warn(`${locale}: batch ${index / BATCH + 1} failed: ${error.message}`);
      }
      if (!args["dry-run"]) await writeFile(file, `${JSON.stringify(dictionary, null, 2)}\n`);
    }
    console.log(`${locale}: ${keys.length} missing`);
  }
  console.log(`Translated ${written} strings; ${failed} left for a rerun.`);
}

await main();
