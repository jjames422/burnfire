"use client";

import { useTranslation } from "@/components/i18n/LanguageProvider";

export function LocalizedNumber({ value }: { value: number }) {
  const { locale } = useTranslation();
  return <>{new Intl.NumberFormat(locale).format(value)}</>;
}
