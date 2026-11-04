import { getLocale } from "@/lib/i18n/server";
import { localizeContentTitle } from "./academy-localization";

export type TrainingSourceRow = {
  slug: string;
  version: number;
  title: string;
  body: string;
};

export async function localizeTrainingRows<T extends TrainingSourceRow>(rows: T[]) {
  const locale = await getLocale();
  return rows.map(({ body, ...row }) => {
    const display = localizeContentTitle({ ...row, body }, locale);
    return { ...row, title: display.title, localization: display.localization };
  });
}

export async function localizeJoinedTrainingRows<T extends {
  training_title: string | null;
  training_source: TrainingSourceRow | null;
}>(rows: T[]) {
  const locale = await getLocale();
  return rows.map(({ training_source, ...row }) => {
    if (!training_source) return row;
    const display = localizeContentTitle(training_source, locale);
    return { ...row, training_title: display.title, localization: display.localization };
  });
}
