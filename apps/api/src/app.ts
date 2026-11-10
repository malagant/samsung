import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { Env } from "./env.js";
import { authorizeUrl, exchangeCode, type TokenSet } from "./smartthings/oauth.js";

export interface AppDeps {
  env: Env;
  /** Persist tokens after a successful SmartThings authorization. */
  saveTokens: (tokens: TokenSet) => Promise<void>;
  /** Handle SmartThings webhook device events. */
  onDeviceEvents: (events: unknown[]) => Promise<void>;
  /** Reachability check for /readyz (e.g. SELECT 1). */
  ping: () => Promise<void>;
  fetchImpl?: typeof fetch;
}

const STATE_COOKIE = "st_oauth_state";

export function createApp(deps: AppDeps) {
  const { env } = deps;
  const app = new Hono();

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

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", async (c) => {
    try {
      await deps.ping();
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  // ── SmartThings OAuth ───────────────────────────────────────────
  app.get("/auth/smartthings", async (c) => {
    const state = randomBytes(16).toString("hex");
    await setSignedCookie(c, STATE_COOKIE, state, env.SESSION_SECRET, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 600,
      path: "/auth/smartthings",
    });
    return c.redirect(authorizeUrl(env, state));
  });

  app.get("/auth/smartthings/callback", async (c) => {
    const expected = await getSignedCookie(c, env.SESSION_SECRET, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/auth/smartthings" });
    const { code, state, error } = c.req.query();
    if (error) return c.redirect(`${env.WEB_PUBLIC_URL}/profile?smartthings=denied`);
    if (!code || !state || !expected || state !== expected) {
      return c.json({ error: "invalid_state" }, 400);
    }
    const tokens = await exchangeCode(env, code, deps.fetchImpl);
    await deps.saveTokens(tokens);
    return c.redirect(`${env.WEB_PUBLIC_URL}/profile?smartthings=linked`);
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

  return app;
}
