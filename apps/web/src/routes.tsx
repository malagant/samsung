import type { ShellProps } from "@samsung/theme-kit";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, createRoute, Link, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { api } from "./api.js";
import { AppearanceSettings, QuickControls } from "./components/Appearance.js";
import { Overview } from "./components/Overview.js";
import { useT, useTheme } from "./theme/ThemeProvider.js";

const NAV = [
  { to: "/", key: "nav.overview" },
  { to: "/analytics", key: "nav.analytics" },
  { to: "/efficiency", key: "nav.efficiency" },
  { to: "/controls", key: "nav.controls" },
  { to: "/settings", key: "nav.settings" },
] as const;

const ShellLink: ShellProps["Link"] = ({ to, className, children }) => (
  <Link to={to} className={className} activeOptions={{ exact: to === "/" }}>
    {children}
  </Link>
);

/** Used when a theme ships no Shell of its own. */
function DefaultShell({ nav, Link: L, controls, status, children }: ShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="flex flex-wrap items-center gap-3 border-border border-b p-3">
        <nav className="flex flex-wrap gap-1">
          {nav.map((n) => (
            <L key={n.to} to={n.to} className="px-3 py-2 text-muted text-sm [&.active]:text-text">
              {n.label}
            </L>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {status}
          {controls}
        </div>
      </header>
      <main className="p-4 md:p-8">{children}</main>
    </div>
  );
}

function ApiStatus() {
  const { t } = useT();
  const health = useQuery({
    queryKey: ["healthz"],
    queryFn: () => api<{ ok: boolean }>("/healthz"),
    retry: false,
  });
  const state = health.isPending ? "checking" : health.data?.ok ? "online" : "offline";
  const color =
    state === "online" ? "var(--ok)" : state === "offline" ? "var(--warn)" : "var(--idle)";
  return (
    <span
      className="flex items-center gap-2 font-[family-name:var(--font-mono)] text-muted text-xs"
      role="status"
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {t(`status.api.${state}`)}
    </span>
  );
}

function Root() {
  const { t } = useT();
  const { theme, scheme } = useTheme();
  const Shell = theme.Shell ?? DefaultShell;
  return (
    <Shell
      nav={NAV.map((n) => ({ to: n.to, label: t(n.key) }))}
      Link={ShellLink}
      controls={<QuickControls />}
      status={<ApiStatus />}
      scheme={scheme}
    >
      <Outlet />
    </Shell>
  );
}

function Placeholder({ titleKey }: { titleKey: string }): ReactNode {
  const { t } = useT();
  return (
    <section>
      <h1 className="m-0 mb-2 font-[family-name:var(--font-display)] font-semibold text-2xl">
        {t(titleKey)}
      </h1>
      <p className="text-muted">{t("placeholder.soon")}</p>
    </section>
  );
}

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Root });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Overview });
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: AppearanceSettings,
});
const pages = NAV.slice(1, 4).map((n) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: n.to,
    component: () => <Placeholder titleKey={n.key} />,
  }),
);

export const routeTree = rootRoute.addChildren([indexRoute, settingsRoute, ...pages]);
