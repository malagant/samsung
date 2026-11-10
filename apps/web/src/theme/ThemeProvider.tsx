import { type ColorScheme, type ThemePlugin, toCssVars } from "@samsung/theme-kit";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import i18n, { LOCALES } from "../i18n/index.js";
import { getTheme, themes } from "../themes/registry.js";

export type SchemePreference = "system" | ColorScheme;

interface ThemeState {
  theme: ThemePlugin;
  themes: ThemePlugin[];
  scheme: ColorScheme;
  schemePreference: SchemePreference;
  setTheme: (id: string) => void;
  setSchemePreference: (s: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const KEY_THEME = "theme.id";
const KEY_SCHEME = "theme.scheme";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Register each theme's string overrides as its own i18n namespace. Every
// locale gets a bundle, even an empty one, so react-i18next treats the
// namespace as loaded instead of rendering raw keys.
for (const t of themes) {
  for (const lng of LOCALES) {
    i18n.addResourceBundle(lng, `theme-${t.id}`, t.messages?.[lng] ?? {}, true, true);
  }
}

function useSystemScheme(): ColorScheme {
  const query =
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const [dark, setDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, [query]);
  return dark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => getTheme(read(KEY_THEME)).id);
  const [schemePreference, setPref] = useState<SchemePreference>(() => {
    const s = read(KEY_SCHEME);
    return s === "light" || s === "dark" ? s : "system";
  });
  const system = useSystemScheme();
  const theme = getTheme(themeId);
  const scheme = schemePreference === "system" ? system : schemePreference;

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(toCssVars(theme, scheme))) root.style.setProperty(k, v);
    root.dataset.themeId = theme.id;
    root.dataset.scheme = scheme;
    root.style.colorScheme = scheme;

    const href = theme.fonts.stylesheet;
    let link = document.getElementById("theme-fonts") as HTMLLinkElement | null;
    if (href) {
      if (!link) {
        link = document.createElement("link");
        link.id = "theme-fonts";
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      if (link.href !== href) link.href = href;
    } else {
      link?.remove();
    }
  }, [theme, scheme]);

  const setTheme = useCallback((id: string) => {
    const t = getTheme(id);
    setThemeId(t.id);
    write(KEY_THEME, t.id);
  }, []);
  const setSchemePreference = useCallback((s: SchemePreference) => {
    setPref(s);
    write(KEY_SCHEME, s);
  }, []);

  const value = useMemo(
    () => ({ theme, themes, scheme, schemePreference, setTheme, setSchemePreference }),
    [theme, scheme, schemePreference, setTheme, setSchemePreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

/** `t()` that lets the active theme override any common string. */
export function useT() {
  const { theme } = useTheme();
  // nsMode "fallback": look up the theme namespace first, then common.
  return useTranslation([`theme-${theme.id}`, "common"], { nsMode: "fallback" });
}
