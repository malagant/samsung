import type { Locale } from "@samsung/theme-kit";

/** Locale-aware number formatting ("32,2" in German, "32.2" in English). */
export function fmt(locale: Locale, value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export const unit = {
  celsius: (l: Locale, v: number | null | undefined, d = 1) => `${fmt(l, v, d)} °C`,
  kwh: (l: Locale, v: number | null | undefined, d = 1) => `${fmt(l, v, d)} kWh`,
};

export function time(locale: Locale, d: Date): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function dateTime(locale: Locale, d: Date): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
