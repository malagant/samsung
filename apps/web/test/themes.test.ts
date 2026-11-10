import { contrastIssues, validateTheme } from "@samsung/theme-kit";
import { describe, expect, it } from "vitest";
import de from "../src/i18n/locales/de.json" with { type: "json" };
import en from "../src/i18n/locales/en.json" with { type: "json" };
import { DEFAULT_THEME_ID, getTheme, themes } from "../src/themes/registry.js";

describe("theme registry", () => {
  it("discovers all three bundled themes", () => {
    expect(themes.map((t) => t.id)).toEqual(["fjord", "glut", "leitstand"]);
    expect(getTheme("nope").id).toBe(DEFAULT_THEME_ID);
  });

  for (const theme of themes) {
    describe(theme.id, () => {
      it("is a valid plugin", () => {
        expect(validateTheme(theme)).toEqual([]);
      });
      it("meets the contrast rules in light and dark", () => {
        expect(contrastIssues(theme)).toEqual([]);
      });
      it("only overrides strings that exist in the common catalogue", () => {
        for (const [lng, msgs] of Object.entries(theme.messages ?? {})) {
          const base = lng === "en" ? en : de;
          for (const key of Object.keys(msgs ?? {})) expect(base).toHaveProperty([key]);
        }
      });
    });
  }
});

describe("locales", () => {
  it("German and English have the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
  it("keep the same interpolation placeholders", () => {
    const vars = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(de))
      expect(vars(en[k as keyof typeof en]), k).toEqual(vars(v));
  });
});
