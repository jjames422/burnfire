import { createAcademyLocalizer, type SourceSection } from "@/lib/i18n/content/localize";
import en from "@/lib/i18n/content/en.json";
import manifest from "@/lib/i18n/content/manifest.json";
import ru from "@/lib/i18n/content/ru.json";
import fil from "@/lib/i18n/content/fil.json";
import fr from "@/lib/i18n/content/fr.json";
import zhCN from "@/lib/i18n/content/zh-CN.json";
import zhTW from "@/lib/i18n/content/zh-TW.json";
import ja from "@/lib/i18n/content/ja.json";
import es from "@/lib/i18n/content/es.json";
import de from "@/lib/i18n/content/de.json";
import ko from "@/lib/i18n/content/ko.json";
import pt from "@/lib/i18n/content/pt.json";
import ar from "@/lib/i18n/content/ar.json";

// The manifest approves exact source hashes, including the two verified v2
// publications whose text still matches the seed. CMS changes fail closed.
export const {
  localizeContent, localizeQuestion, localizeTrainingSection, localizeContentTitle,
} = createAcademyLocalizer(
  en as SourceSection[],
  { ru, fil, fr, "zh-CN": zhCN, "zh-TW": zhTW, ja, es, de, ko, pt, ar },
  manifest,
);
