"use client";

import { useState } from "react";
import { direction, isLocale, languageNames, locales, preferenceCookie } from "@/lib/i18n/locales";
import { useTranslation } from "./LanguageProvider";
import "./language.css";

const labels = {
  en: "Language", ru: "Язык", fil: "Wika", fr: "Langue", "zh-CN": "语言", "zh-TW": "語言",
  ja: "言語", es: "Idioma", de: "Sprache", ko: "언어", pt: "Idioma", ar: "اللغة",
  "sr-Latn": "Jezik", "sr-Cyrl": "Језик", bs: "Jezik", hr: "Jezik",
};
const saveErrors = {
  en: "Allow cookies to save your language choice.",
  ru: "Разрешите файлы cookie, чтобы сохранить выбранный язык.",
  fil: "Payagan ang cookies upang ma-save ang iyong napiling wika.",
  fr: "Autorisez les cookies pour enregistrer votre langue.",
  "zh-CN": "请允许 Cookie 以保存您的语言选择。",
  "zh-TW": "請允許 Cookie 以儲存您的語言選擇。",
  ja: "言語の選択を保存するには、Cookie を許可してください。",
  es: "Permite las cookies para guardar tu idioma.",
  de: "Erlaube Cookies, um deine Sprachauswahl zu speichern.",
  ko: "언어 선택을 저장하려면 쿠키를 허용해 주세요.",
  pt: "Permita cookies para salvar sua escolha de idioma.",
  ar: "اسمح بملفات تعريف الارتباط لحفظ اختيار اللغة.",
  "sr-Latn": "Dozvolite kolačiće da biste sačuvali izbor jezika.",
  "sr-Cyrl": "Дозволите колачиће да бисте сачували избор језика.",
  bs: "Dozvolite kolačiće da biste sačuvali odabir jezika.",
  hr: "Dopustite kolačiće kako biste spremili odabir jezika.",
};

export function LanguageSelector() {
  const { locale } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (process.env.NEXT_PUBLIC_LOCALIZATION_ENABLED !== "true") return null;
  return <span className="language-control"><label className="language-selector">
    <span aria-hidden="true">◎</span>
    <span className="sr-only">{labels[locale]}</span>
    <select value={locale} aria-label={labels[locale]} dir={direction(locale)} onChange={(event) => {
      const selected = event.target.value;
      if (!isLocale(selected) || selected === locale) return;
      document.cookie = preferenceCookie(selected, window.location.hostname, window.location.protocol === "https:");
      if (!document.cookie.split(";").some((cookie) => cookie.trim() === `bf_locale=${selected}`)) {
        setFailed(true);
        return;
      }
      window.location.reload();
    }}>
      {locales.map((language) => <option key={language} value={language} lang={language}>{languageNames[language]}</option>)}
    </select>
  </label>{failed && <span role="alert" className="language-error">{saveErrors[locale]}</span>}</span>;
}
