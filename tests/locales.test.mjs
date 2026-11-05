import assert from "node:assert/strict";
import test from "node:test";
import { direction, isLocale, languageNames, locales, matchLocale, negotiateLocale, preferenceCookie } from "../lib/i18n/locales.ts";
import { translate } from "../lib/i18n/translate.ts";

test("all sixteen requested languages have native names and correct writing direction", () => {
  assert.equal(locales.length, 16);
  assert.equal(new Set(locales).size, 16);
  for (const locale of locales) {
    assert.ok(languageNames[locale]);
    assert.ok(isLocale(locale));
    assert.equal(direction(locale), locale === "ar" ? "rtl" : "ltr");
  }
  assert.equal(isLocale("constructor"), false);
  assert.equal(isLocale("../../en"), false);
});

test("browser languages are matched automatically without geolocation", () => {
  for (const [header, expected] of [
    ["ru-RU, en;q=0.8", "ru"], ["fr-CA, en;q=0.5", "fr"],
    ["tl-PH, en-US;q=0.9", "fil"], ["fil-PH", "fil"],
    ["zh-Hant-HK, en;q=0.2", "zh-TW"], ["zh-Hans-TW", "zh-CN"],
    ["zh-HK", "zh-TW"], ["zh-MO", "zh-TW"], ["zh-SG", "zh-CN"],
    ["ja-JP", "ja"], ["ko-KR", "ko"], ["pt-BR", "pt"], ["ar-EG", "ar"],
    ["es-MX", "es"], ["de-AT", "de"],
    ["sr-Latn-RS", "sr-Latn"], ["sr-Cyrl-RS", "sr-Cyrl"], ["sr-RS", "sr-Cyrl"], ["sr", "sr-Cyrl"],
    ["sh", "sr-Latn"], ["bs-BA", "bs"], ["hr-HR", "hr"], ["hr", "hr"],
    ["fr;q=0.2,ru;q=0.9", "ru"], ["ru;q=0,fr;q=0.4", "fr"],
    ["ru;q=9,ja;q=0.9", "ja"], ["ru;q=NaN,fr;q=1.0", "fr"],
    ["ru;q=-1,ko;q=0.5", "ko"], ["xx-ZZ, de;q=0.5", "de"],
    ["<script>,../../ru", "en"], ["", "en"], [null, "en"],
  ]) assert.equal(negotiateLocale(undefined, header), expected, String(header));
  assert.equal(matchLocale("zh_Hant"), "zh-TW");
});

test("manual choice overrides browser preferences and invalid preferences do not", () => {
  assert.equal(negotiateLocale("en", "ru-RU"), "en");
  assert.equal(negotiateLocale("ja", "fr-FR"), "ja");
  assert.equal(negotiateLocale("ar", "en-US"), "ar");
  assert.equal(negotiateLocale("invalid", "fr-FR"), "fr");
});

test("language preference persists across public/portal hosts but never unrelated domains", () => {
  const cookie = preferenceCookie("fr", "portal.burnfire2.com", true);
  assert.match(cookie, /^bf_locale=fr;/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=31536000/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Domain=burnfire2.com/);
  assert.doesNotMatch(preferenceCookie("ja", "localhost", false), /Secure|Domain=/);
  assert.doesNotMatch(preferenceCookie("ru", "burnfire2.com.example.org", true), /Domain=/);
  assert.throws(() => preferenceCookie("fr; Domain=example.org", "localhost", false));
});

test("stored translations interpolate named values without interpreting markup or user content", () => {
  const dictionary = { "Step {step} of {total}": "Étape {step} sur {total}" };
  assert.equal(translate("Step {step} of {total}", dictionary, { step: 2, total: 5 }), "Étape 2 sur 5");
  assert.equal(translate("Step {step} of {total}", dictionary, { step: 2 }), "Étape 2 sur {total}");
  assert.equal(translate("Member-written chat text", dictionary), "Member-written chat text");
  assert.equal(translate("constructor", dictionary), "constructor");
  assert.equal(translate("{name}", {}, { name: "<script>" }), "<script>");
});

test("known server message templates translate interpolated errors without translating their values", () => {
  const dictionary = {
    "Request failed ({status}).": "Échec de la requête ({status}).",
    "Recruit requested help with {title}.": "La recrue demande de l'aide pour {title}.",
    "{anything}": "never match arbitrary content",
  };
  assert.equal(translate("Request failed (503).", dictionary), "Échec de la requête (503).");
  assert.equal(translate("Recruit requested help with Member's custom title.", dictionary),
    "La recrue demande de l'aide pour Member's custom title.");
  assert.equal(translate("Member-written chat text", dictionary), "Member-written chat text");
  assert.equal(translate("Request failed [503].", dictionary), "Request failed [503].");
});
