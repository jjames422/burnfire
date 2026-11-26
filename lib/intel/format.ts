// Display helpers shared by the intelligence screens.

export function compact(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: Math.abs(value) >= 1e9 ? 2 : 1 }).format(value);
}

export function full(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function signed(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${compact(Math.abs(value), locale)}`;
}

export function percent(value: number | null | undefined, locale: string, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(value));
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatted}%`;
}

export function trend(value: number | null | undefined): "up" | "down" | "flat" | "none" {
  if (value === null || value === undefined || !Number.isFinite(value)) return "none";
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

export function relative(iso: string | number | null | undefined, locale: string, now = Date.now()): string {
  if (iso === null || iso === undefined) return "—";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unit, seconds] of units) if (Math.abs(diff) >= seconds) return format.format(Math.round(diff / seconds), unit);
  return format.format(Math.round(diff), "second");
}

export function day(iso: string | number | null | undefined, locale: string): string {
  if (iso === null || iso === undefined) return "—";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function dateTime(iso: string | number | null | undefined, locale: string): string {
  if (iso === null || iso === undefined) return "—";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(new Date(iso));
}

/** Round axis ticks: 4-6 clean values spanning [min, max]. */
export function ticks(min: number, max: number, count = 4, integer = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const start = Math.floor(min / step) * step;
  const values: number[] = [];
  // Always end on a tick at or above the maximum so no mark rises past the top gridline.
  for (let value = start; values.length < 50; value += step) {
    values.push(Number(value.toPrecision(12)));
    if (value >= max - step * 1e-9) break;
  }
  return values;
}
