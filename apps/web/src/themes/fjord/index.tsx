import { defineTheme, type ShellProps } from "@samsung/theme-kit";

function FjordShell({ nav, Link, controls, status, children }: ShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-5 md:px-8">
        <div className="flex items-center gap-2">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 15c3-3 6 3 9 0s6 3 9 0" />
            <path d="M3 9c3-3 6 3 9 0s6 3 9 0" />
          </svg>
          <span className="font-extrabold text-lg tracking-tight">fjord</span>
        </div>
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="whitespace-nowrap rounded-full px-4 py-2 text-muted text-sm [&.active]:bg-accent [&.active]:font-semibold [&.active]:text-on-accent"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {status}
          {controls}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-10 md:px-8">{children}</main>
    </div>
  );
}

export default defineTheme({
  id: "fjord",
  version: "1.0.0",
  name: { de: "Fjord", en: "Fjord" },
  description: {
    de: "Ruhig und luftig. Manrope, große Werte, runde Karten.",
    en: "Calm and airy. Manrope, large figures, rounded cards.",
  },
  fonts: {
    stylesheet:
      "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
    sans: "'Manrope', system-ui, sans-serif",
    mono: "'Manrope', system-ui, sans-serif",
    display: "'Manrope', system-ui, sans-serif",
  },
  shape: { radius: 20, controlRadius: 999, borders: false },
  typography: { upperLabels: false, numerals: "display" },
  tokens: {
    light: {
      bg: "#F2F5F4",
      surface: "#FFFFFF",
      surface2: "#E6ECEA",
      text: "#102A27",
      muted: "#4E6662",
      border: "#DCE5E3",
      accent: "#0F766E",
      onAccent: "#FFFFFF",
      heat: "#C2410C",
      dhw: "#2F6FD6",
      ok: "#15803D",
      warn: "#A16207",
      idle: "#DCE5E3",
    },
    dark: {
      bg: "#0D1716",
      surface: "#152321",
      surface2: "#1E302D",
      text: "#E7F1EF",
      muted: "#93ABA6",
      border: "#22322F",
      accent: "#2DD4BF",
      onAccent: "#042F2B",
      heat: "#F28A5C",
      dhw: "#6EA8FF",
      ok: "#4ADE80",
      warn: "#FACC15",
      idle: "#22322F",
    },
  },
  Shell: FjordShell,
});
