import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  defineTheme,
  type ThemePlugin,
  toCssVars,
  validateTheme,
} from "../src/index.js";

const tokens = {
  bg: "#ffffff",
  surface: "#ffffff",
  surface2: "#f0f0f0",
  text: "#111111",
  muted: "#555555",
  border: "#dddddd",
  accent: "#0f766e",
  onAccent: "#ffffff",
  heat: "#c2410c",
  dhw: "#1d4ed8",
  ok: "#15803d",
  warn: "#a16207",
  idle: "#dddddd",
};

const base: ThemePlugin = {
  id: "test",
  name: { de: "Test", en: "Test" },
  description: { de: "", en: "" },
  version: "1.0.0",
  tokens: { light: tokens, dark: tokens },
  fonts: { sans: "Inter, sans-serif", mono: "monospace" },
  shape: { radius: 12, controlRadius: 8, borders: true },
  typography: { upperLabels: false, numerals: "mono" },
};

describe("theme-kit", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("validates ids and tokens", () => {
    expect(validateTheme(base)).toEqual([]);
    expect(validateTheme({ ...base, id: "Bad Id" })).toHaveLength(1);
    const broken = { ...base, tokens: { ...base.tokens, dark: { ...tokens, text: "red" } } };
    expect(() => defineTheme(broken)).toThrow(/dark.text/);
  });

  it("emits CSS variables", () => {
    const v = toCssVars(base, "light");
    expect(v["--surface-2"]).toBe("#f0f0f0");
    expect(v["--on-accent"]).toBe("#ffffff");
    expect(v["--radius"]).toBe("12px");
    expect(v["--font-numerals"]).toBe("monospace");
    expect(v["--label-transform"]).toBe("none");
  });
});
