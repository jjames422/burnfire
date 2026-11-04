import { cache } from "react";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, negotiateLocale } from "./locales";
import { getDictionary } from "./dictionaries";
import { translate, type TranslationValues } from "./translate";

export const getLocale = cache(async () => {
  if (process.env.NEXT_PUBLIC_LOCALIZATION_ENABLED !== "true") return "en";
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return negotiateLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"));
});

export async function getTranslator() {
  const dictionary = await getDictionary(await getLocale());
  return (source: string, values?: TranslationValues) => translate(source, dictionary, values);
}
