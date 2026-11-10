import { defineTheme, type ShellProps } from "@samsung/theme-kit";

function GlutShell({ nav, Link, controls, status, children }: ShellProps) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-bg text-text">
      <aside className="flex w-full flex-col gap-1 border-border border-b p-4 md:min-h-dvh md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 px-2 pb-6">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--heat)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z" />
          </svg>
          <span className="font-semibold">Glut</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-[var(--control-radius)] px-3 py-2.5 text-muted text-sm [&.active]:bg-surface-2 [&.active]:font-medium [&.active]:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6">
          {status}
          {controls}
        </div>
      </aside>
      <main className="min-w-0 flex-[999_1_560px] p-4 md:p-8">{children}</main>
    </div>
  );
}

export default defineTheme({
  id: "glut",
  version: "1.0.0",
  name: { de: "Glut", en: "Glut" },
  description: {
    de: "Warm und präzise. IBM Plex, Zahlen in Monospace, Seitenleiste.",
    en: "Warm and precise. IBM Plex, monospaced figures, sidebar.",
  },
  fonts: {
    stylesheet:
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    sans: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  shape: { radius: 12, controlRadius: 8, borders: true },
  typography: { upperLabels: false, numerals: "mono" },
  tokens: {
    light: {
      bg: "#F6F3EE",
      surface: "#FFFFFF",
      surface2: "#EFEAE2",
      text: "#1C1A17",
      muted: "#5E574D",
      border: "#E2DBD0",
      accent: "#C2410C",
      onAccent: "#FFFFFF",
      heat: "#C2410C",
      dhw: "#1D4ED8",
      ok: "#15803D",
      warn: "#A16207",
      idle: "#E2DBD0",
    },
    dark: {
      bg: "#15130F",
      surface: "#1E1B16",
      surface2: "#2A251E",
      text: "#F3EEE6",
      muted: "#A89F92",
      border: "#353027",
      accent: "#FB923C",
      onAccent: "#1C1A17",
      heat: "#FB923C",
      dhw: "#60A5FA",
      ok: "#4ADE80",
      warn: "#FACC15",
      idle: "#353027",
    },
  },
  Shell: GlutShell,
});
