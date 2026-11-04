"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { translate, type Dictionary, type TranslationValues } from "@/lib/i18n/translate";

const LanguageContext = createContext<{
  locale: Locale;
  t: (source: string, values?: TranslationValues) => string;
} | null>(null);

export function LanguageProvider({ locale, dictionary, children }: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(() => ({
    locale,
    t: (source: string, values?: TranslationValues) => translate(source, dictionary, values),
  }), [locale, dictionary]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is required.");
  return context;
}

export function Text({ children, values }: { children: string; values?: TranslationValues }) {
  return useTranslation().t(children, values);
}
