import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "./api.js";
import { getTheme, setTheme, type Theme } from "./theme.js";

const NAV = [
  { to: "/", label: "Übersicht" },
  { to: "/analytics", label: "Verlauf" },
  { to: "/efficiency", label: "Effizienz" },
  { to: "/controls", label: "Steuerung" },
  { to: "/settings", label: "Einstellungen" },
] as const;

function ThemeToggle() {
  const [theme, set] = useState<Theme>(getTheme);
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  return (
    <button
      type="button"
      className="rounded-md border border-border px-3 py-1.5 text-sm text-muted"
      onClick={() => {
        const t = next[theme];
        setTheme(t);
        set(t);
      }}
    >
      Theme: {theme}
    </button>
  );
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-border bg-surface p-4 md:border-r md:border-b-0">
        <div className="mb-6 font-semibold">Wärmepumpe</div>
        <nav className="flex gap-2 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-md px-3 py-2 text-sm text-muted [&.active]:bg-surface-2 [&.active]:text-text"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6">
          <ThemeToggle />
        </div>
      </aside>
      <main className="p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  ),
});

function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
      <p className="text-muted">Kommt in Schritt 3.</p>
    </section>
  );
}

function Overview() {
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: () => api<{ ok: boolean }>("/healthz"),
  });
  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Übersicht</h1>
      <div className="rounded-xl border border-border bg-surface p-4">
        API:{" "}
        {health.isPending ? (
          "…"
        ) : health.data?.ok ? (
          <span className="text-ok">erreichbar</span>
        ) : (
          <span className="text-heat">nicht erreichbar</span>
        )}
      </div>
    </section>
  );
}

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Overview });
const pages = NAV.slice(1).map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: n.to,
    component: () => <Placeholder title={n.label} />,
  }),
);

export const routeTree = rootRoute.addChildren([indexRoute, ...pages]);
