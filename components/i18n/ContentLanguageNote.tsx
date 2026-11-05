"use client";

import { useTranslation } from "./LanguageProvider";

export type ContentLanguage = {
  locale: string;
  fallback: boolean;
};

const notices = {
  en: "English original. Translation of this version is awaiting review.",
  ru: "Оригинал на английском. Перевод этой версии ожидает проверки.",
  fil: "Orihinal sa Ingles. Hinihintay pa ang pagsusuri ng salin ng bersyong ito.",
  fr: "Version originale en anglais. La traduction de cette version est en attente de vérification.",
  "zh-CN": "英文原文。此版本的翻译正在等待审核。",
  "zh-TW": "英文原文。此版本的翻譯正在等待審核。",
  ja: "英語の原文です。この版の翻訳は確認待ちです。",
  es: "Original en inglés. La traducción de esta versión está pendiente de revisión.",
  de: "Englisches Original. Die Übersetzung dieser Version wartet auf Prüfung.",
  ko: "영어 원문입니다. 이 버전의 번역은 검토 대기 중입니다.",
  pt: "Original em inglês. A tradução desta versão aguarda revisão.",
  ar: "النص الأصلي بالإنجليزية. ترجمة هذا الإصدار بانتظار المراجعة.",
  "sr-Latn": "Original na engleskom. Prevod ove verzije čeka proveru.",
  "sr-Cyrl": "Оригинал на енглеском. Превод ове верзије чека проверу.",
  bs: "Original na engleskom. Prijevod ove verzije čeka provjeru.",
  hr: "Izvornik na engleskom. Prijevod ove inačice čeka provjeru.",
};

export function ContentLanguageNote({ localization }: { localization?: ContentLanguage }) {
  const { locale } = useTranslation();
  if (!localization?.fallback) return null;
  return <p role="note" className="my-3 border border-warning/40 p-3 text-sm text-warning">{notices[locale]}</p>;
}
