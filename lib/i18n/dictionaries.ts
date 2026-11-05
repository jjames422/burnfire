import type { Locale } from "./locales";
import type { Dictionary } from "./translate";

const loaders = {
  ru: () => Promise.all([import("./ui/ru.json"), import("./messages/ru.json")]),
  fil: () => Promise.all([import("./ui/fil.json"), import("./messages/fil.json")]),
  fr: () => Promise.all([import("./ui/fr.json"), import("./messages/fr.json")]),
  "zh-CN": () => Promise.all([import("./ui/zh-CN.json"), import("./messages/zh-CN.json")]),
  "zh-TW": () => Promise.all([import("./ui/zh-TW.json"), import("./messages/zh-TW.json")]),
  ja: () => Promise.all([import("./ui/ja.json"), import("./messages/ja.json")]),
  es: () => Promise.all([import("./ui/es.json"), import("./messages/es.json")]),
  de: () => Promise.all([import("./ui/de.json"), import("./messages/de.json")]),
  ko: () => Promise.all([import("./ui/ko.json"), import("./messages/ko.json")]),
  pt: () => Promise.all([import("./ui/pt.json"), import("./messages/pt.json")]),
  ar: () => Promise.all([import("./ui/ar.json"), import("./messages/ar.json")]),
  "sr-Latn": () => Promise.all([import("./ui/sr-Latn.json"), import("./messages/sr-Latn.json")]),
  "sr-Cyrl": () => Promise.all([import("./ui/sr-Cyrl.json"), import("./messages/sr-Cyrl.json")]),
  bs: () => Promise.all([import("./ui/bs.json"), import("./messages/bs.json")]),
  hr: () => Promise.all([import("./ui/hr.json"), import("./messages/hr.json")]),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === "en") return {};
  const [ui, messages] = await loaders[locale]();
  return { ...messages.default, ...ui.default };
}
