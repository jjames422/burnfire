import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import { contentSourceHash, isTranslationFresh } from "../lib/content/localization.ts";
import { isLocale } from "../lib/i18n/locales.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceGuidesDir = path.join(root, "content/burnfire/guides");
const locales = ["ru", "fil", "fr", "zh-CN", "zh-TW", "ja", "es", "de", "ko", "pt", "ar"];

test("every available localized guide compiles as MDX", async (t) => {
  for (const locale of locales) {
    const guideDir = path.join(root, "content/burnfire/locales", locale, "guides");
    const names = (await readdir(guideDir)).filter((name) => name.endsWith(".mdx")).sort();
    for (const name of names) {
      await t.test(`${locale}/${name}`, async () => {
        const { content } = matter(await readFile(path.join(guideDir, name), "utf8"));
        const result = await serialize(content, {
          mdxOptions: { remarkPlugins: [remarkGfm] },
        });
        assert.ok(result.compiledSource.length > 0);
      });
    }
  }
});

const heroSource = await readFile(path.join(root, "lib/content/heroes.ts"), "utf8");
const heroModuleCode = ts.transpileModule(heroSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const require = createRequire(import.meta.url);

function loadHeroModule(read = readFile) {
  const module = { exports: {} };
  new Function("require", "module", "exports", heroModuleCode)((specifier) => {
    if (specifier === "@/lib/i18n/server") return { getLocale: async () => "en" };
    if (specifier === "@/lib/i18n/locales") return { isLocale };
    if (specifier === "node:fs/promises") return { readFile: read };
    return require(specifier);
  }, module, module.exports);
  return module.exports;
}

const heroModule = loadHeroModule();

function sourceHeroHash(hero) {
  return createHash("sha256").update(JSON.stringify([
    hero.slug, hero.tierLists ?? null, hero.summary, hero.unlock,
    hero.overview, hero.investment, hero.squadFit,
    hero.skills.map(({ effect, starUpgrades, maxStars }) => [
      effect, starUpgrades ?? null, maxStars ?? null,
    ]),
  ])).digest("hex");
}

function assertPercentages(source, translated, label) {
  const number = "[\\d٠-٩]+(?:[.,٬٫\\u00a0\\u202f ]+[\\d٠-٩]+)*";
  const range = new RegExp(`(${number})\\s*(?:[-–—~〜～]|至|到|から|에서|to|a|à|bis|до|إلى|hanggang)\\s*(${number})\\s*([%٪])`, "g");
  const percentages = (text) => [...text.replace(range, "$1$3 - $2$3").matchAll(/[\d٠-٩]+(?:[.,٬٫\u00a0\u202f ]+[\d٠-٩]+)*\s*[%٪]/g)]
    .map(([value]) => value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
      .replace(/[\s%٪٬]/g, "").replaceAll("٫", "."));
  const expected = percentages(source).map((value) => Number(value.replaceAll(",", "")));
  const actual = percentages(translated);
  assert.equal(actual.length, expected.length, `${label}: percentage coverage`);
  for (const value of expected) {
    const index = actual.findIndex((text) => [
      Number(text.replaceAll(",", "")),
      Number(text.replaceAll(".", "").replace(",", ".")),
    ].includes(value));
    assert.notEqual(index, -1, `${label}: missing ${value}%`);
    actual.splice(index, 1);
  }
}

test("hero numeric checks accept localized ranges but reject omitted or altered percentages", () => {
  for (const translated of ["87,15 % à 1 249 %", "87.15～1,249%", "٨٧٫١٥٪ إلى ١٬٢٤٩٪"]) {
    assertPercentages("87.15% to 1,249%", translated, "localized range");
  }
  assert.throws(() => assertPercentages("50% chance for 20% damage", "20% damage", "omitted chance"));
  assert.throws(() => assertPercentages("50% chance for 20% damage", "50% chance for 25% damage", "changed value"));
});

test("all source guides have faithful localized MDX snapshots in every supported locale", async () => {
  const sourceNames = (await readdir(sourceGuidesDir)).filter((name) => name.endsWith(".mdx")).sort();
  assert.equal(sourceNames.length, 19);

  for (const locale of locales) {
    const localeDir = path.join(root, "content/burnfire/locales", locale);
    const guideDir = path.join(localeDir, "guides");
    await assert.doesNotReject(
      readFile(path.join(localeDir, "manifest.json")),
      `${locale} guide source-hash manifest must exist`,
    );
    const localizedNames = (await readdir(guideDir)).filter((name) => name.endsWith(".mdx")).sort();
    assert.deepEqual(localizedNames, sourceNames, `${locale} guide inventory`);
    const manifest = JSON.parse(await readFile(path.join(localeDir, "manifest.json"), "utf8"));

    for (const name of sourceNames) {
      const sourceRaw = await readFile(path.join(sourceGuidesDir, name), "utf8");
      const localizedRaw = await readFile(path.join(guideDir, name), "utf8");
      const source = matter(sourceRaw);
      const localized = matter(localizedRaw);
      const slug = name.slice(0, -4);
      assert.equal(localized.data.slug, source.data.slug, `${locale}/${slug} stable slug`);
      assert.deepEqual(localized.data.tags, source.data.tags, `${locale}/${slug} stable filter tags`);
      for (const field of ["alliance", "author", "authorRank", "publishedAt", "updatedAt", "draft", "heroImage"]) {
        assert.equal(localized.data[field], source.data[field], `${locale}/${slug} stable ${field}`);
      }
      assert.ok(localized.data.title && localized.data.title !== source.data.title, `${locale}/${slug} translated title`);
      assert.ok(localized.data.summary && localized.data.summary !== source.data.summary, `${locale}/${slug} translated summary`);
      assert.ok(localized.content.trim().length > 100, `${locale}/${slug} nonempty body`);
      assert.notEqual(localized.content.trim(), source.content.trim(), `${locale}/${slug} translated body`);
      assert.ok(isTranslationFresh(sourceRaw, manifest.guides?.[slug]), `${locale}/${slug} source snapshot`);
      for (const prefix of ["## ", "### "]) {
        const count = (text) => text.split("\n").filter((line) => line.startsWith(prefix)).length;
        assert.equal(count(localized.content), count(source.content), `${locale}/${slug} preserves ${prefix.trim()} sections`);
      }
      const sourceLinks = [...source.content.matchAll(/(?:src="|href="|\]\()([^")]+)["\)]/g)].map((match) => match[1]).sort();
      const translatedLinks = [...localized.content.matchAll(/(?:src="|href="|\]\()([^")]+)["\)]/g)].map((match) => match[1]).sort();
      assert.deepEqual(translatedLinks, sourceLinks, `${locale}/${slug} preserves images and destinations`);
      const componentNames = (text) => [...text.matchAll(/<([A-Z][A-Za-z]*)\b/g)].map((match) => match[1]).sort();
      assert.deepEqual(componentNames(localized.content), componentNames(source.content), `${locale}/${slug} preserves MDX components`);
      assert.equal(
        isTranslationFresh(`${sourceRaw}\n<!-- revised -->`, manifest.guides?.[slug]),
        false,
        `${locale}/${slug} rejects stale source snapshot`,
      );
    }
  }
});

test("stored localized snapshots are invalidated whenever source text changes", () => {
  const source = "Reviewed source snapshot";
  const sourceHash = contentSourceHash(source);
  assert.equal(isTranslationFresh(source, sourceHash), true);
  assert.equal(isTranslationFresh(`${source}!`, sourceHash), false);
  assert.equal(isTranslationFresh(source, null), false);
});

test("hero narrative catalogs translate every hero field and skill without changing canonical names", async (t) => {
  const { heroes, getLocalizedHeroes } = heroModule;
  assert.equal(heroes.length, 31, "hero source inventory");

  for (const locale of locales) {
    await t.test(locale, async (localeTest) => {
      const heroPath = path.join(root, "content/burnfire/locales", locale, "heroes.json");
      await assert.doesNotReject(readFile(heroPath), `${locale} localized hero catalog must exist`);
      const catalog = JSON.parse(await readFile(heroPath, "utf8"));
      assert.deepEqual(Object.keys(catalog).sort(), heroes.map(({ slug }) => slug).sort(), `${locale} hero inventory`);
      const displayed = await getLocalizedHeroes(locale);
      for (const [heroIndex, source] of heroes.entries()) {
        const { slug } = source;
        await localeTest.test(slug, () => {
          const translated = catalog[slug];
          assert.ok(translated.summary?.trim(), `${locale}/${slug} summary`);
          assert.ok(translated.unlock?.trim(), `${locale}/${slug} unlock`);
          assert.ok(translated.investment?.trim(), `${locale}/${slug} investment`);
          assert.ok(translated.squadFit?.trim(), `${locale}/${slug} squad fit`);
          assert.equal(translated.sourceHash, sourceHeroHash(source), `${locale}/${slug} current source hash`);
          assert.equal(heroModule.heroSourceHash(source), sourceHeroHash(source));
          if (source.tierLists !== undefined) {
            assert.ok(translated.tierLists?.trim(), `${locale}/${slug} tier list summary`);
            assert.notEqual(translated.tierLists, source.tierLists, `${locale}/${slug} translated tier list summary`);
            assert.equal(displayed[heroIndex].tierLists, translated.tierLists);
          }
          assert.equal(translated.overview?.length, source.overview.length, `${locale}/${slug} overview coverage`);
          assert.ok(translated.overview.every((paragraph) => typeof paragraph === "string" && paragraph.trim()));
          for (const field of ["summary", "unlock", "investment", "squadFit"]) {
            assert.notEqual(translated[field], source[field], `${locale}/${slug} translated ${field}`);
            assert.equal(displayed[heroIndex][field], translated[field], `${locale}/${slug} rendered ${field}`);
          }
          assert.deepEqual(displayed[heroIndex].overview, translated.overview);
          for (const field of ["summary", "unlock", "investment", "squadFit", "tierLists"]) {
            if (source[field]) assertPercentages(source[field], translated[field], `${locale}/${slug}/${field}`);
          }
          source.overview.forEach((paragraph, index) => {
            assert.notEqual(translated.overview[index], paragraph, `${locale}/${slug}/overview/${index} translated paragraph`);
            assertPercentages(paragraph, translated.overview[index], `${locale}/${slug}/overview/${index}`);
          });
          for (const field of ["name", "faction", "role", "maxStats", "exclusiveWeapon", "skillPriority", "pairsWith"]) {
            assert.deepEqual(displayed[heroIndex][field], source[field], `${locale}/${slug} canonical ${field}`);
          }
          assert.equal(Object.keys(translated.skills ?? {}).length, source.skills.length, `${locale}/${slug} skill coverage`);
          for (let index = 0; index < source.skills.length; index += 1) {
            const localizedSkill = translated.skills[String(index)];
            assert.ok(localizedSkill?.effect?.trim(), `${locale}/${slug} skill ${index} effect`);
            assert.notEqual(localizedSkill.effect, source.skills[index].effect, `${locale}/${slug} translated effect`);
            assert.equal(displayed[heroIndex].skills[index].effect, localizedSkill.effect);
            assertPercentages(source.skills[index].effect, localizedSkill.effect, `${locale}/${slug}/skill/${index}`);
            assert.equal(displayed[heroIndex].skills[index].name, source.skills[index].name);
            if (source.skills[index].starUpgrades !== undefined) {
              assert.equal(localizedSkill.starUpgrades?.length, source.skills[index].starUpgrades.length,
                `${locale}/${slug} skill ${index} star upgrades`);
              assert.ok(localizedSkill.starUpgrades.every((upgrade) => typeof upgrade === "string" && upgrade.trim()));
              assert.deepEqual(displayed[heroIndex].skills[index].starUpgrades, localizedSkill.starUpgrades);
              source.skills[index].starUpgrades.forEach((upgrade, upgradeIndex) => {
                assert.notEqual(localizedSkill.starUpgrades[upgradeIndex], upgrade, `${locale}/${slug}/skill/${index}/upgrade/${upgradeIndex} translated upgrade`);
                assertPercentages(upgrade, localizedSkill.starUpgrades[upgradeIndex], `${locale}/${slug}/skill/${index}/upgrade/${upgradeIndex}`);
              });
            }
            if (source.skills[index].maxStars !== undefined) {
              assert.ok(localizedSkill.maxStars?.trim(), `${locale}/${slug} skill ${index} max stars`);
              assert.equal(displayed[heroIndex].skills[index].maxStars, localizedSkill.maxStars);
              assert.notEqual(localizedSkill.maxStars, source.skills[index].maxStars, `${locale}/${slug}/skill/${index}/maxStars translated maximum`);
              assertPercentages(source.skills[index].maxStars, localizedSkill.maxStars, `${locale}/${slug}/skill/${index}/maxStars`);
            }
          }
          });
      }
    });
  }
});

test("hero source edits invalidate translations and missing fields are explicitly labeled English", async () => {
  const hero = heroModule.heroes[0];
  const partial = { sourceHash: sourceHeroHash(hero), summary: "Résumé traduit" };
  const module = loadHeroModule(async () => JSON.stringify({ [hero.slug]: partial }));
  const translated = await module.getLocalizedHero(hero.slug, "fr");
  assert.equal(translated.summary, partial.summary);
  assert.match(translated.unlock, /^English original \(fr translation unavailable\):/);
  assert.match(translated.skills[0].effect, /^English original \(fr translation unavailable\):/);
  partial.sourceHash = sourceHeroHash({ ...hero, summary: `${hero.summary}!` });
  assert.match((await module.getLocalizedHero(hero.slug, "fr")).summary, /^English original/);
  assert.equal(await module.getLocalizedHero("missing-hero", "fr"), undefined);
  await assert.rejects(module.getLocalizedHeroes("../../fr"), /Unsupported content locale/);
  assert.deepEqual(await module.getLocalizedHeroes("en"), heroModule.heroes);
  const brokenModule = loadHeroModule(async () => "{broken");
  await assert.rejects(brokenModule.getLocalizedHeroes("fr"), SyntaxError);
  for (const invalid of [
    { summary: " " },
    { overview: [""] },
    { skills: { "0": { effect: "" } } },
    { skills: { "0": { starUpgrades: [" "] } } },
  ]) {
    const invalidModule = loadHeroModule(async () => JSON.stringify({
      [hero.slug]: { sourceHash: sourceHeroHash(hero), ...invalid },
    }));
    const fallback = await invalidModule.getLocalizedHero(hero.slug, "fr");
    assert.match(fallback.summary, /^English original/);
    assert.match(fallback.skills[0].effect, /^English original/);
  }
  const mixedModule = loadHeroModule(async () => JSON.stringify({
    [hero.slug]: {
      sourceHash: sourceHeroHash(hero), summary: "Résumé traduit", unlock: " ",
      skills: { "0": { effect: "" } },
    },
  }));
  const mixed = await mixedModule.getLocalizedHero(hero.slug, "fr");
  assert.equal(mixed.summary, "Résumé traduit");
  assert.match(mixed.unlock, /^English original/);
  assert.match(mixed.skills[0].effect, /^English original/);
});

test("dynamic hero tier labels have translations in every non-English locale", async () => {
  for (const locale of locales) {
    const dictionary = JSON.parse(await readFile(path.join(root, "lib/i18n/ui", `${locale}.json`), "utf8"));
    for (const tier of new Set(heroModule.heroes.map(({ tier }) => tier).filter(Boolean))) {
      assert.ok(dictionary[tier]?.trim(), `${locale}: ${tier}`);
    }
  }
});
