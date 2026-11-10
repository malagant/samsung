import { defineTheme, type ShellProps } from "@samsung/theme-kit";

function LeitstandShell({ nav, Link, controls, status, children }: ShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="flex flex-wrap items-stretch border-border border-b">
        <div className="flex items-center bg-accent px-5 py-3 font-bold font-mono text-on-accent text-sm tracking-wider">
          LEITSTAND
        </div>
        <nav className="flex grow overflow-x-auto">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center whitespace-nowrap border-border border-r border-b-[3px] border-b-transparent px-4 py-3 text-muted text-sm uppercase [&.active]:border-b-accent [&.active]:font-semibold [&.active]:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 px-4 py-2 font-mono text-muted text-xs">
          {status}
          {controls}
        </div>
      </header>
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}

export default defineTheme({
  id: "leitstand",
  version: "1.0.0",
  name: { de: "Leitstand", en: "Leitstand" },
  description: {
    de: "Technisch und dicht. Space Grotesk, harte Kanten, Signalgelb.",
    en: "Technical and dense. Space Grotesk, hard edges, signal yellow.",
  },
  fonts: {
    stylesheet:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap",
    sans: "'Space Grotesk', system-ui, sans-serif",
    mono: "'Space Mono', ui-monospace, monospace",
    display: "'Space Grotesk', system-ui, sans-serif",
  },
  shape: { radius: 0, controlRadius: 0, borders: true },
  typography: { upperLabels: true, numerals: "display" },
  tokens: {
    light: {
      bg: "#F7F7F4",
      surface: "#F7F7F4",
      surface2: "#ECECE7",
      text: "#111111",
      muted: "#55554F",
      border: "#D4D4CE",
      accent: "#FFD23F",
      onAccent: "#111111",
      heat: "#C2410C",
      dhw: "#1C64D8",
      ok: "#1F7A45",
      warn: "#8A5A00",
      idle: "#D4D4CE",
    },
    dark: {
      bg: "#0B0B0A",
      surface: "#0B0B0A",
      surface2: "#1A1A18",
      text: "#F2F2EE",
      muted: "#9A9A92",
      border: "#2A2A27",
      accent: "#FFD23F",
      onAccent: "#111111",
      heat: "#FF7A45",
      dhw: "#5C9DFF",
      ok: "#3DDC84",
      warn: "#FFD23F",
      idle: "#2A2A27",
    },
  },
  messages: {
    de: { "brand.tagline": "Anlagenüberwachung" },
    en: { "brand.tagline": "Plant monitoring" },
  },
  Shell: LeitstandShell,
});
