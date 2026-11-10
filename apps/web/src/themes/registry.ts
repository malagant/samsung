import type { ThemePlugin } from "@samsung/theme-kit";

/**
 * Theme discovery. Every `src/themes/<id>/index.tsx` that default-exports a
 * `defineTheme(...)` result is registered at build time. Adding a theme means
 * adding a folder; nothing else in the app changes.
 */
const modules = import.meta.glob<{ default: ThemePlugin }>("./*/index.tsx", { eager: true });

export const themes: ThemePlugin[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

export const DEFAULT_THEME_ID = "glut";

export function getTheme(id: string | null | undefined): ThemePlugin {
  const found = themes.find((t) => t.id === id) ?? themes.find((t) => t.id === DEFAULT_THEME_ID);
  if (!found) throw new Error("No themes registered");
  return found;
}
