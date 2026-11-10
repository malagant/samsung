/**
 * Theme plugin contract.
 *
 * A theme is a plain object created with `defineTheme()`. It always provides
 * colour tokens for light and dark, fonts and shape; it may also provide its
 * own app shell (layout) and override UI strings per locale. The web app
 * discovers themes at build time and switches between them at runtime.
 */
import type { ComponentType, ReactNode } from "react";

export type Locale = "de" | "en";
export type ColorScheme = "light" | "dark";
export type LocalizedText = Record<Locale, string>;

/** Semantic colour roles. Every theme must define all of them for both schemes. */
export const TOKEN_KEYS = [
  "bg",
  "surface",
  "surface2",
  "text",
  "muted",
  "border",
  "accent",
  "onAccent",
  "heat",
  "dhw",
  "ok",
  "warn",
  "idle",
] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];
export type ColorTokens = Record<TokenKey, string>;

export interface ThemeFonts {
  /** A Google Fonts css2 URL (or any stylesheet) loaded when the theme is active. */
  stylesheet?: string;
  sans: string;
  mono: string;
  /** Used for large numbers and headings; defaults to `sans`. */
  display?: string;
}

export interface ThemeShape {
  /** Corner radius for cards, in px. */
  radius: number;
  /** Corner radius for controls, in px. */
  controlRadius: number;
  /** Draw card borders (true) or rely on surface contrast (false). */
  borders: boolean;
}

export interface ThemeTypography {
  /** Render small labels in upper case. */
  upperLabels: boolean;
  /** Font used for measured values. */
  numerals: "mono" | "display";
}

export interface NavItem {
  to: string;
  label: string;
}

export interface ShellProps {
  nav: NavItem[];
  /** Router-aware link component supplied by the host app. */
  Link: ComponentType<{ to: string; className?: string; children: ReactNode }>;
  /** Host-provided controls (theme, scheme and language switchers). */
  controls: ReactNode;
  /** Small status line, e.g. "live · 12:11". */
  status?: ReactNode;
  scheme: ColorScheme;
  children: ReactNode;
}

export interface ThemePlugin {
  /** Stable id, `[a-z][a-z0-9-]*`. Persisted in user preferences. */
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  version: string;
  tokens: Record<ColorScheme, ColorTokens>;
  fonts: ThemeFonts;
  shape: ThemeShape;
  typography: ThemeTypography;
  /** Optional app shell. Without one the host's default shell is used. */
  Shell?: ComponentType<ShellProps>;
  /** Optional string overrides, keyed like the host's message catalogue. */
  messages?: Partial<Record<Locale, Record<string, string>>>;
}

const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;

/** Identity helper that gives theme authors type checking and validates at load. */
export function defineTheme(theme: ThemePlugin): ThemePlugin {
  const problems = validateTheme(theme);
  if (problems.length > 0) {
    throw new Error(`Invalid theme "${theme.id}":\n- ${problems.join("\n- ")}`);
  }
  return theme;
}

export function validateTheme(theme: ThemePlugin): string[] {
  const out: string[] = [];
  if (!ID_RE.test(theme.id)) out.push(`id must match ${ID_RE}`);
  for (const scheme of ["light", "dark"] as const) {
    const t = theme.tokens[scheme];
    if (!t) {
      out.push(`missing ${scheme} tokens`);
      continue;
    }
    for (const k of TOKEN_KEYS) {
      if (typeof t[k] !== "string" || parseColor(t[k]) === null) {
        out.push(`${scheme}.${k} must be a #rrggbb colour`);
      }
    }
  }
  return out;
}

/** CSS custom properties for one scheme, plus shape and font variables. */
export function toCssVars(theme: ThemePlugin, scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const k of TOKEN_KEYS) vars[`--${kebab(k)}`] = theme.tokens[scheme][k];
  vars["--radius"] = `${theme.shape.radius}px`;
  vars["--control-radius"] = `${theme.shape.controlRadius}px`;
  vars["--card-border-width"] = theme.shape.borders ? "1px" : "0px";
  vars["--font-sans"] = theme.fonts.sans;
  vars["--font-mono"] = theme.fonts.mono;
  vars["--font-display"] = theme.fonts.display ?? theme.fonts.sans;
  vars["--font-numerals"] =
    theme.typography.numerals === "mono"
      ? theme.fonts.mono
      : (theme.fonts.display ?? theme.fonts.sans);
  vars["--label-transform"] = theme.typography.upperLabels ? "uppercase" : "none";
  return vars;
}

function kebab(s: string): string {
  return s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);
}

// ── Contrast (WCAG 2.x) ───────────────────────────────────────────────

export function parseColor(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 0;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export interface ContrastIssue {
  scheme: ColorScheme;
  fg: TokenKey;
  bg: TokenKey;
  ratio: number;
  min: number;
}

/** Pairs every theme must pass. Text 4.5:1, large numbers and UI accents 3:1. */
export const CONTRAST_RULES: Array<{ fg: TokenKey; bg: TokenKey; min: number }> = [
  { fg: "text", bg: "bg", min: 4.5 },
  { fg: "text", bg: "surface", min: 4.5 },
  { fg: "text", bg: "surface2", min: 4.5 },
  { fg: "muted", bg: "surface", min: 4.5 },
  { fg: "muted", bg: "bg", min: 4.5 },
  { fg: "onAccent", bg: "accent", min: 4.5 },
  { fg: "heat", bg: "surface", min: 3 },
  { fg: "dhw", bg: "surface", min: 3 },
  { fg: "ok", bg: "surface", min: 3 },
];

export function contrastIssues(theme: ThemePlugin): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  for (const scheme of ["light", "dark"] as const) {
    const t = theme.tokens[scheme];
    for (const r of CONTRAST_RULES) {
      const ratio = contrastRatio(t[r.fg], t[r.bg]);
      if (ratio < r.min) issues.push({ scheme, fg: r.fg, bg: r.bg, ratio, min: r.min });
    }
  }
  return issues;
}
