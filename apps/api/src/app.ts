import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { authRoutes } from "./auth/routes.js";
import { type AuthVars, jsonOnly, loadUser, requireOwner, requireUser } from "./auth/session.js";
import type { AuthStore } from "./auth/store.js";
import type { Env } from "./env.js";
import { authorizeUrl, exchangeCode, type TokenSet } from "./smartthings/oauth.js";
import { monthKey, type TelemetryStore } from "./telemetry/store.js";
import { summarize } from "./telemetry/summary.js";

export interface AppDeps {
  env: Env;
  /** Persist tokens after a successful SmartThings authorization. */
  saveTokens: (tokens: TokenSet) => Promise<void>;
  /** Handle SmartThings webhook device events. */
  onDeviceEvents: (events: unknown[]) => Promise<void>;
  /** Reachability check for /readyz (e.g. SELECT 1). */
  ping: () => Promise<void>;
  /** App accounts and sessions. */
  auth: AuthStore;
  /** Read access to stored telemetry for the dashboard. */
  store?: Pick<
    TelemetryStore,
    "allDevices" | "lastTelemetry" | "telemetryRange" | "callsThisMonth" | "latestFsv"
  >;
  /** Polling state of the linked SmartThings account, or null when none is linked. */
  accountStatus?: () => Promise<{ pollingStatus: string; lastSuccessfulPoll: Date | null } | null>;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

const STATE_COOKIE = "st_oauth_state";

export function createApp(deps: AppDeps) {
  const { env } = deps;
  const app = new Hono<AuthVars>();
  const now = deps.now ?? (() => new Date());
  // The API sits behind the web proxy under a path prefix (e.g. /api), so cookies
  // scoped to an API route have to include it.
  const apiBase = new URL(env.API_PUBLIC_URL).pathname.replace(/\/$/, "");
  const stateCookiePath = `${apiBase}/auth/smartthings`;
  const secure = new URL(env.WEB_PUBLIC_URL).protocol === "https:";
  const session = { store: deps.auth, secure, now };

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      credentials: true,
    }),
  );

  app.use("*", jsonOnly);
  app.use("*", loadUser(session));

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", async (c) => {
    try {
      await deps.ping();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  // ── App login ──────────────────────────────────────────────────
  app.route("/", authRoutes(session));

  // ── SmartThings OAuth (owner only) ──────────────────────────────
  app.get("/auth/smartthings", requireOwner, async (c) => {
    const state = randomBytes(16).toString("hex");
    await setSignedCookie(c, STATE_COOKIE, state, env.SESSION_SECRET, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      maxAge: 600,
      path: stateCookiePath,
    });
    return c.redirect(authorizeUrl(env, state));
  });

  app.get("/auth/smartthings/callback", requireOwner, async (c) => {
    const expected = await getSignedCookie(c, env.SESSION_SECRET, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: stateCookiePath });
    const { code, state, error } = c.req.query();
    if (error) return c.redirect(`${env.WEB_PUBLIC_URL}/settings?smartthings=denied`);
    if (!code || !state || !expected || state !== expected) {
      return c.json({ error: "invalid_state" }, 400);
    }
    const tokens = await exchangeCode(env, code, deps.fetchImpl);
    await deps.saveTokens(tokens);
    return c.redirect(`${env.WEB_PUBLIC_URL}/settings?smartthings=linked`);
  });

  // ── SmartThings webhook (lifecycle events) ─────────────────────
  // TODO: verify the HTTP signature header before trusting the payload.
  app.post("/webhooks/smartthings", async (c) => {
    const body = (await c.req.json()) as {
      lifecycle?: string;
      confirmationData?: { confirmationUrl?: string };
      pingData?: { challenge?: string };
      eventData?: { events?: unknown[] };
    };
    switch (body.lifecycle) {
      case "CONFIRMATION": {
        const url = body.confirmationData?.confirmationUrl;
        if (url?.startsWith("https://")) await (deps.fetchImpl ?? fetch)(url);
        return c.json({ targetUrl: `${env.API_PUBLIC_URL}/webhooks/smartthings` });
      }
      case "PING":
        return c.json({ pingData: { challenge: body.pingData?.challenge } });
      case "EVENT":
        await deps.onDeviceEvents(body.eventData?.events ?? []);
        return c.json({ eventData: {} });
      default:
        return c.json({}, 200);
    }
  });

  // ── Telemetry (read) ───────────────────────────────────────────
  const store = deps.store;
  if (store) {
    app.use("/smartthings/status", requireUser);
    app.use("/devices", requireUser);
    app.use("/devices/*", requireUser);
    app.get("/smartthings/status", async (c) => {
      const status = await deps.accountStatus?.();
      return c.json({
        linked: status !== null && status !== undefined,
        pollingStatus: status?.pollingStatus ?? null,
        lastSuccessfulPoll: status?.lastSuccessfulPoll?.toISOString() ?? null,
        callsThisMonth: await store.callsThisMonth(monthKey(now())),
        monthlyBudget: env.SMARTTHINGS_MONTHLY_CALL_BUDGET,
      });
    });

    app.get("/devices", async (c) => {
      const list = await store.allDevices();
      return c.json(list.map(({ userId: _u, ...d }) => d));
    });

    app.get("/devices/:id/latest", async (c) => {
      const row = await store.lastTelemetry(c.req.param("id"));
      return row ? c.json(row) : c.json({ error: "no_data" }, 404);
    });

    app.get("/devices/:id/fsv", async (c) => {
      const fsv = await store.latestFsv(c.req.param("id"));
      return fsv
        ? c.json({ reportedAt: fsv.reportedAt.toISOString(), values: fsv.values })
        : c.json({ error: "no_data" }, 404);
    });

    app.get("/devices/:id/telemetry", async (c) => {
      const hours = Math.min(24 * 31, Math.max(1, Number(c.req.query("hours")) || 24));
      const to = now();
      const from = new Date(to.getTime() - hours * 3600_000);
      const rows = await store.telemetryRange(c.req.param("id"), from, to);
      const withRaw = c.req.query("raw") === "1";
      return c.json({
        summary: summarize(rows, from, to),
        rows: withRaw
          ? rows
          : rows.map(({ rawIndoorCycleData: _i, rawOutdoorCycleData: _o, ...r }) => r),
      });
    });
  }

  return app;
}
