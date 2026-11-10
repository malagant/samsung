import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppearanceSettings } from "../src/components/Appearance.js";
import i18n from "../src/i18n/index.js";
import { ThemeProvider } from "../src/theme/ThemeProvider.js";

beforeAll(async () => {
  await i18n.changeLanguage("de");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("ThemeProvider", () => {
  it("applies the theme tokens to <html> and switches themes", () => {
    render(
      <ThemeProvider>
        <AppearanceSettings />
      </ThemeProvider>,
    );
    const root = document.documentElement;
    expect(root.dataset.themeId).toBe("glut");
    expect(root.style.getPropertyValue("--bg")).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Leitstand/ }));
    expect(root.dataset.themeId).toBe("leitstand");
    expect(root.style.getPropertyValue("--radius")).toBe("0px");
    expect(localStorage.getItem("theme.id")).toBe("leitstand");
  });

  it("switches scheme and language", async () => {
    render(
      <ThemeProvider>
        <AppearanceSettings />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByLabelText("Dunkel"));
    expect(document.documentElement.dataset.scheme).toBe("dark");

    await act(async () => {
      fireEvent.click(screen.getByLabelText("English"));
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings");
    expect(document.documentElement.lang).toBe("en");
  });
});
