import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { locales } from "../lib/i18n/locales.ts";

const problems = [];
const catalogs = new Map();
const placeholders = (value) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort().join(",");

for (const group of ["ui", "messages"]) {
  const dictionaries = new Map();
  for (const locale of locales.filter((value) => value !== "en")) {
    const file = `lib/i18n/${group}/${locale}.json`;
    const dictionary = JSON.parse(await readFile(file, "utf8"));
    if (Array.isArray(dictionary) || dictionary === null || typeof dictionary !== "object") {
      problems.push(`${file}: expected source-string dictionary`);
      continue;
    }
    dictionaries.set(locale, dictionary);
    for (const [source, translated] of Object.entries(dictionary)) {
      if (typeof translated !== "string" || !translated.trim()) {
        problems.push(`${file}: empty translation for ${JSON.stringify(source)}`);
      } else if (placeholders(source) !== placeholders(translated)) {
        problems.push(`${file}: changed placeholders in ${JSON.stringify(source)}`);
      }
    }
  }
  const keys = new Set([...dictionaries.values()].flatMap(Object.keys));
  if (!keys.size) problems.push(`${group}: empty catalogs`);
  for (const [locale, dictionary] of dictionaries) {
    for (const key of keys) {
      if (!Object.hasOwn(dictionary, key)) problems.push(`${group}/${locale}: missing ${JSON.stringify(key)}`);
    }
    catalogs.set(locale, { ...catalogs.get(locale), ...dictionary });
  }
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const required = new Map();
const untranslated = [];
function requireSource(source, file) {
  if (/[A-Za-z]/.test(source)) required.set(source, file);
}
const entities = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: "\u00a0", rarr: "\u2192", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026" };
function jsxText(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)));
    return entities[entity] ?? whole;
  }).replace(/\s+/g, " ").trim();
}

for (const file of (await Promise.all(["app", "components"].map(sourceFiles))).flat()) {
  if (file.startsWith("components/i18n/")) continue;
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const first = node.arguments[0];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) requireSource(first.text, file);
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Text") {
      for (const child of node.children) {
        if (ts.isJsxText(child)) requireSource(jsxText(child.text), file);
        else if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) requireSource(child.expression.text, file);
      }
    }
    if (ts.isJsxText(node)) {
      const text = jsxText(node.text);
      const tag = ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText(source) : "";
      if (tag !== "Text" && /[A-Za-z]{3}/.test(text)
        && !/^(?:BurnFire|BurnFire Alliance|Last Asylum|Last Asylum: Plague|BF2|BF|LA|BURNFIRE|BURNFIRE ALLIANCE|LAST ASYLUM|PLAGUE|R[1-5]|https?:\/\/\S+)$/.test(text)) {
        untranslated.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${JSON.stringify(text)}`);
      }
    }
    if (ts.isJsxAttribute(node) && ["aria-label", "placeholder", "title", "alt"].includes(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer) && /[A-Za-z]{3}/.test(node.initializer.text)
        && !/^(?:BurnFire|BurnFire Alliance|Last Asylum|Last Asylum: Plague)$/.test(node.initializer.text)) {
        untranslated.push(`${file}: attribute ${node.name.getText(source)}=${JSON.stringify(node.initializer.text)}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  if (untranslated.length) problems.push(`Unlocalized static interface text:\n${untranslated.join("\n")}`);
  visit(source);
}
for (const [source, file] of required) {
  for (const [locale, dictionary] of catalogs) {
    if (!Object.hasOwn(dictionary, source)) problems.push(`${file}: ${locale} lacks ${JSON.stringify(source)}`);
  }
}
if (problems.length) throw new Error(problems.join("\n"));
console.log(`Localization checked: ${locales.length} locales, ${required.size} literal interface messages, aligned catalogs and placeholders.`);
