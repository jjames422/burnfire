import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import matter from "gray-matter";
import { locales, direction } from "../lib/i18n/locales.ts";

const baseUrl = process.env.BURNFIRE_API_TEST_URL;
const escapeHtml = (text) => text.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;",
})[character]);

test("public and authenticated-entry pages render the negotiated language before hydration", {
  skip: !baseUrl || process.env.NEXT_PUBLIC_LOCALIZATION_ENABLED !== "true",
}, async (t) => {
  const origin = new URL(baseUrl).origin;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
  async function page(path, language, cookie = "") {
    const response = await fetch(new URL(path, origin), {
      headers: { "Accept-Language": language, Cookie: cookie },
    });
    assert.equal(response.status, 200, `${path} ${language}`);
    return response.text();
  }
  for (const locale of locales) {
    await t.test(locale, async () => {
      const html = await page("/", locale);
      assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`));
      assert.match(html, new RegExp(`<html[^>]+dir="${direction(locale)}"`));
      assert.doesNotMatch(html, /NEXT_HTTP_ERROR_FALLBACK;500/);
      if (locale !== "en") {
        const dictionary = JSON.parse(await readFile(new URL(`../lib/i18n/ui/${locale}.json`, import.meta.url), "utf8"));
        assert.ok(html.includes(dictionary["Sign in"]), `${locale} translated public sign-in`);
        assert.ok(html.includes(dictionary["Create account"]), `${locale} translated public registration`);
        const portal = await page("/portal", locale);
        assert.ok(portal.includes(dictionary["Your headquarters"]), `${locale} translated portal navigation`);
        assert.ok(portal.includes(dictionary["Enter the survivor network"]), `${locale} translated sign-in heading`);
        const heroes = JSON.parse(await readFile(new URL(`../content/burnfire/locales/${locale}/heroes.json`, import.meta.url), "utf8"));
        for (const slug of ["arthur", "cynthia", "kafa"]) {
          assert.ok(heroes[slug], `${locale}/${slug}: hero translation exists`);
          const dossier = await page(`/heroes/${slug}`, "en", `bf_locale=${locale}`);
          assert.ok(dossier.includes(escapeHtml(heroes[slug].summary)), `${locale}/${slug}: translated hero summary`);
          assert.ok(dossier.includes(escapeHtml(heroes[slug].skills["0"].effect)), `${locale}/${slug}: translated skill`);
          assert.ok(!dossier.includes("English original"), `${locale}/${slug}: complete hero dossier`);
        }
        const source = await readFile(new URL(`../content/burnfire/locales/${locale}/guides/alliance-research-101.mdx`, import.meta.url), "utf8");
        const { data } = matter(source);
        const guide = await page("/guides/alliance-research-101", "en", `bf_locale=${locale}`);
        assert.ok(guide.includes(escapeHtml(data.title)), `${locale}: translated guide title`);
        assert.ok(!guide.includes("English original"), `${locale}: complete translated guide`);
      }
    });
  }
  for (const path of ["/portal", "/academy", "/chat", "/portal/security", "/guides"]) {
    const html = await page(path, "ru-RU", "bf_locale=fr");
    assert.match(html, /<html[^>]+lang="fr"/, path);
    assert.match(html, /<html[^>]+dir="ltr"/, path);
  }
  assert.match(await page("/portal", "ar-EG"), /<html[^>]+dir="rtl"/);
  assert.match(await page("/portal", "zh-Hant-HK"), /<html[^>]+lang="zh-TW"/);
  assert.match(await page("/portal", "ru", "bf_locale=en"), /<html[^>]+lang="en"/);
  assert.match(await page("/portal", "ja-JP", "bf_locale=invalid"), /<html[^>]+lang="ja"/);
});
