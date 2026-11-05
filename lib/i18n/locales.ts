export const locales = ["en", "ru", "fil", "fr", "zh-CN", "zh-TW", "ja", "es", "de", "ko", "pt", "ar", "sr-Latn", "sr-Cyrl", "bs", "hr"] as const;
export type Locale = typeof locales[number];
export const LOCALE_COOKIE = "bf_locale";

export const languageNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  fil: "Filipino",
  fr: "Français",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  es: "Español",
  de: "Deutsch",
  ko: "한국어",
  pt: "Português",
  ar: "العربية",
  "sr-Latn": "Srpski (latinica)",
  "sr-Cyrl": "Српски (ћирилица)",
  bs: "Bosanski",
  hr: "Hrvatski",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}

export function matchLocale(value: string): Locale | null {
  const tag = value.trim().replaceAll("_", "-").toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) return null;
  const parts = tag.split("-");
  if (parts[0] === "zh") {
    if (parts.includes("hant")) return "zh-TW";
    if (parts.includes("hans")) return "zh-CN";
    return parts.some((part) => ["tw", "hk", "mo"].includes(part)) ? "zh-TW" : "zh-CN";
  }
  if (parts[0] === "tl") return "fil";
  if (parts[0] === "sh") return "sr-Latn";
  // Plain "sr" follows the CLDR default script for Serbian, which is Cyrillic.
  if (parts[0] === "sr") return parts.includes("latn") ? "sr-Latn" : "sr-Cyrl";
  return locales.find((locale) => locale === parts[0]) ?? null;
}

export function negotiateLocale(saved: unknown, acceptLanguage: string | null): Locale {
  if (isLocale(saved)) return saved;
  const candidates = (acceptLanguage ?? "").slice(0, 4096).split(",").map((entry, order) => {
    const [tag, ...parameters] = entry.trim().split(";");
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const raw = quality?.trim().slice(2);
    const weight = raw === undefined ? 1 : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw) ? Number(raw) : 0;
    return { locale: matchLocale(tag), weight, order };
  });
  candidates.sort((a, b) => b.weight - a.weight || a.order - b.order);
  return candidates.find((candidate) => candidate.locale && candidate.weight > 0)?.locale ?? "en";
}

export function direction(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function preferenceCookie(locale: Locale, hostname: string, secure: boolean): string {
  if (!isLocale(locale)) throw new Error("Unsupported language preference.");
  const domain = hostname === "burnfire2.com" || hostname.endsWith(".burnfire2.com")
    ? "; Domain=burnfire2.com" : "";
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}${domain}`;
}
