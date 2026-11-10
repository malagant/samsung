import type { Locale } from "@samsung/theme-kit";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };

export const LOCALES: Locale[] = ["de", "en"];
export const resources = { de: { common: de }, en: { common: en } } as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: LOCALES,
    fallbackLng: "de",
    nonExplicitSupportedLngs: true,
    defaultNS: "common",
    ns: ["common"],
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
  });

i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng.slice(0, 2);
});

export function currentLocale(): Locale {
  return i18n.resolvedLanguage === "en" ? "en" : "de";
}

export default i18n;
