import { useTranslation } from "react-i18next";
import { currentLocale, LOCALES } from "../i18n/index.js";
import { type SchemePreference, useT, useTheme } from "../theme/ThemeProvider.js";
import { Card, Label } from "./ui.js";

const SCHEMES: SchemePreference[] = ["system", "light", "dark"];

/** Compact theme / scheme / language switchers for the shell. */
export function QuickControls() {
  const { t } = useT();
  const { i18n } = useTranslation();
  const { theme, themes, setTheme, schemePreference, setSchemePreference } = useTheme();
  const l = currentLocale();
  const select =
    "min-h-9 rounded-[var(--control-radius)] border border-border bg-surface px-2 text-sm text-text";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="qc-theme">
        {t("settings.theme")}
      </label>
      <select
        id="qc-theme"
        className={select}
        value={theme.id}
        onChange={(e) => setTheme(e.target.value)}
      >
        {themes.map((th) => (
          <option key={th.id} value={th.id}>
            {th.name[l]}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="qc-scheme">
        {t("settings.scheme")}
      </label>
      <select
        id="qc-scheme"
        className={select}
        value={schemePreference}
        onChange={(e) => setSchemePreference(e.target.value as SchemePreference)}
      >
        {SCHEMES.map((s) => (
          <option key={s} value={s}>
            {t(`settings.scheme.${s}`)}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="qc-lang">
        {t("settings.language")}
      </label>
      <select
        id="qc-lang"
        className={select}
        value={l}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {LOCALES.map((lng) => (
          <option key={lng} value={lng}>
            {lng.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Full appearance settings with a preview card per theme. */
export function AppearanceSettings() {
  const { t } = useT();
  const { i18n } = useTranslation();
  const { theme, themes, scheme, setTheme, schemePreference, setSchemePreference } = useTheme();
  const l = currentLocale();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 font-[family-name:var(--font-display)] font-semibold text-2xl">
        {t("settings.title")}
      </h1>
      <Card label={t("settings.appearance")}>
        <h2 className="m-0 mb-3 font-semibold text-base">{t("settings.theme")}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {themes.map((th) => {
            const tk = th.tokens[scheme];
            const active = th.id === theme.id;
            return (
              <button
                key={th.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTheme(th.id)}
                className="flex flex-col gap-3 rounded-[var(--radius)] border-2 p-3 text-left"
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: tk.bg,
                  color: tk.text,
                }}
              >
                <span className="flex items-center justify-between">
                  <span
                    className="font-semibold"
                    style={{ fontFamily: th.fonts.display ?? th.fonts.sans }}
                  >
                    {th.name[l]}
                  </span>
                  {active ? <span className="text-xs">✓ {t("settings.active")}</span> : null}
                </span>
                <span className="flex gap-1.5" aria-hidden="true">
                  {(["surface", "accent", "heat", "dhw", "ok"] as const).map((k) => (
                    <span
                      key={k}
                      className="h-6 w-6 border"
                      style={{
                        background: tk[k],
                        borderColor: tk.border,
                        borderRadius: Math.min(th.shape.radius, 12),
                      }}
                    />
                  ))}
                </span>
                <span className="text-sm" style={{ color: tk.muted }}>
                  {th.description[l]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card label={t("settings.scheme")}>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 font-semibold text-base">{t("settings.scheme")}</legend>
            {SCHEMES.map((s) => (
              <label key={s} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scheme"
                  value={s}
                  checked={schemePreference === s}
                  onChange={() => setSchemePreference(s)}
                />
                {t(`settings.scheme.${s}`)}
              </label>
            ))}
          </fieldset>
        </Card>
        <Card label={t("settings.language")}>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 font-semibold text-base">{t("settings.language")}</legend>
            {LOCALES.map((lng) => (
              <label key={lng} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="lang"
                  value={lng}
                  checked={l === lng}
                  onChange={() => void i18n.changeLanguage(lng)}
                />
                {t(`lang.${lng}`)}
              </label>
            ))}
          </fieldset>
        </Card>
      </div>
      <Label>{`${theme.id}@${theme.version}`}</Label>
    </div>
  );
}
