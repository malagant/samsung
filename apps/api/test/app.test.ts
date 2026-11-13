import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { Controls } from "../src/controls/controller.js";
import { loadEnv } from "../src/env.js";
import { NotLinkedError } from "../src/telemetry/poller.js";
import { MemoryAuthStore } from "./memory-auth-store.js";
import { MemoryBoostStore } from "./memory-boost-store.js";
import { MemoryStore } from "./memory-store.js";

const env = loadEnv({
  NODE_ENV: "test",
  API_PUBLIC_URL: "http://localhost:8787",
  WEB_PUBLIC_URL: "http://localhost:5173",
  CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "test-secret-test-secret",
  SMARTTHINGS_CLIENT_ID: "cid",
  SMARTTHINGS_CLIENT_SECRET: "csecret",
  SMARTTHINGS_REDIRECT_URI: "http://localhost:8787/auth/smartthings/callback",
});

function setup() {
  const deps = {
    env,
    ping: vi.fn(async () => {}),
    auth: new MemoryAuthStore(),
    saveTokens: vi.fn(async () => {}),
    onDeviceEvents: vi.fn(async () => {}),
    fetchImpl: vi.fn(async () => Response.json({})) as unknown as typeof fetch,
  };
  return { app: createApp(deps), deps };
}

type App = ReturnType<typeof createApp>;

const json = (body: unknown, cookie?: string) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
});

/** The `name=value` part of the session cookie a response sets. */
function sessionCookie(res: Response): string {
  const set = res.headers.getSetCookie().find((c) => c.startsWith("session="));
  if (!set) throw new Error("no session cookie");
  return set.split(";")[0] ?? "";
}

async function signUpOwner(
  app: App,
  email = "owner@example.org",
  password = "correct horse battery",
) {
  const res = await app.request("/auth/setup", json({ email, password }));
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

describe("api", () => {
  it("serves health", async () => {
    const { app } = setup();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("redirects to SmartThings with a state cookie", async () => {
    const { app } = setup();
    const cookie = await signUpOwner(app);
    const res = await app.request("/auth/smartthings", { headers: { cookie } });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("https://api.smartthings.com");
    expect(loc.searchParams.get("client_id")).toBe("cid");
    expect(loc.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers.get("set-cookie")).toContain("st_oauth_state=");
  });

  it("rejects a callback without a matching state", async () => {
    const { app, deps } = setup();
    const cookie = await signUpOwner(app);
    const res = await app.request("/auth/smartthings/callback?code=x&state=y", {
      headers: { cookie },
    });
    expect(res.status).toBe(400);
    expect(deps.saveTokens).not.toHaveBeenCalled();
  });

  it("answers webhook PING with the challenge", async () => {
    const { app } = setup();
    const res = await app.request("/webhooks/smartthings", {
      method: "POST",
      body: JSON.stringify({ lifecycle: "PING", pingData: { challenge: "abc" } }),
      headers: { "content-type": "application/json" },
    });
    expect(await res.json()).toEqual({ pingData: { challenge: "abc" } });
  });

  it("forwards webhook EVENTs", async () => {
    const { app, deps } = setup();
    await app.request("/webhooks/smartthings", {
      method: "POST",
      body: JSON.stringify({ lifecycle: "EVENT", eventData: { events: [{ a: 1 }] } }),
      headers: { "content-type": "application/json" },
    });
    expect(deps.onDeviceEvents).toHaveBeenCalledWith([{ a: 1 }]);
  });
});

describe("app login", () => {
  it("requires setup first, then only allows it once", async () => {
    const { app } = setup();
    expect(await (await app.request("/auth/state")).json()).toEqual({
      setupRequired: true,
      user: null,
    });
    const cookie = await signUpOwner(app);
    const state = (await (await app.request("/auth/state", { headers: { cookie } })).json()) as {
      setupRequired: boolean;
      user: { role: string };
    };
    expect(state.setupRequired).toBe(false);
    expect(state.user.role).toBe("owner");
    const again = await app.request(
      "/auth/setup",
      json({ email: "x@example.org", password: "another long one" }),
    );
    expect(again.status).toBe(409);
  });

  it("rejects short passwords at setup", async () => {
    const { app } = setup();
    const res = await app.request(
      "/auth/setup",
      json({ email: "o@example.org", password: "short" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "too_short" });
  });

  it("protects device data and the SmartThings link", async () => {
    const { app } = setup();
    expect((await app.request("/auth/me")).status).toBe(401);
    expect((await app.request("/auth/smartthings")).status).toBe(401);
  });

  it("logs in and out with a session cookie", async () => {
    const { app } = setup();
    await signUpOwner(app, "Owner@Example.org");
    const bad = await app.request(
      "/auth/login",
      json({ email: "owner@example.org", password: "wrong password" }),
    );
    expect(bad.status).toBe(401);
    const unknown = await app.request(
      "/auth/login",
      json({ email: "nobody@example.org", password: "whatever123" }),
    );
    expect(unknown.status).toBe(401);

    const ok = await app.request(
      "/auth/login",
      json({ email: " OWNER@example.org", password: "correct horse battery" }),
    );
    expect(ok.status).toBe(200);
    const set = ok.headers.getSetCookie().join("\n");
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    const cookie = sessionCookie(ok);
    expect((await app.request("/auth/me", { headers: { cookie } })).status).toBe(200);

    await app.request("/auth/logout", json({}, cookie));
    expect((await app.request("/auth/me", { headers: { cookie } })).status).toBe(401);
  });

  it("refuses non-JSON state changes", async () => {
    const { app } = setup();
    const res = await app.request("/auth/login", {
      method: "POST",
      body: "email=a&password=b",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(415);
  });

  it("limits login attempts per e-mail", async () => {
    const { app } = setup();
    await signUpOwner(app);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await app.request(
          "/auth/login",
          json({ email: "owner@example.org", password: "nope nope nope" }),
        )
      ).status;
    }
    expect(last).toBe(429);
  });

  it("changes the password and ends other sessions", async () => {
    const { app } = setup();
    const first = await signUpOwner(app);
    const other = sessionCookie(
      await app.request(
        "/auth/login",
        json({ email: "owner@example.org", password: "correct horse battery" }),
      ),
    );
    const wrong = await app.request(
      "/auth/password",
      json({ current: "nope", next: "a brand new password" }, first),
    );
    expect(wrong.status).toBe(401);
    const res = await app.request(
      "/auth/password",
      json({ current: "correct horse battery", next: "a brand new password" }, first),
    );
    expect(res.status).toBe(200);
    const fresh = sessionCookie(res);
    expect((await app.request("/auth/me", { headers: { cookie: other } })).status).toBe(401);
    expect((await app.request("/auth/me", { headers: { cookie: fresh } })).status).toBe(200);
    const login = await app.request(
      "/auth/login",
      json({ email: "owner@example.org", password: "a brand new password" }),
    );
    expect(login.status).toBe(200);
  });

  it("lets the owner manage family members, who can read but not administer", async () => {
    const { app } = setup();
    const owner = await signUpOwner(app);
    const add = await app.request(
      "/family",
      json({ email: "kid@example.org", password: "family password", displayName: "Kid" }, owner),
    );
    expect(add.status).toBe(201);
    const kid = (await add.json()) as { id: string; role: string };
    expect(kid.role).toBe("family");
    const dup = await app.request(
      "/family",
      json({ email: "KID@example.org", password: "family password" }, owner),
    );
    expect(dup.status).toBe(409);

    const list = (await (
      await app.request("/family", { headers: { cookie: owner } })
    ).json()) as unknown[];
    expect(list).toHaveLength(1);

    const kidCookie = sessionCookie(
      await app.request(
        "/auth/login",
        json({ email: "kid@example.org", password: "family password" }),
      ),
    );
    expect((await app.request("/auth/me", { headers: { cookie: kidCookie } })).status).toBe(200);
    expect((await app.request("/family", { headers: { cookie: kidCookie } })).status).toBe(403);
    expect(
      (await app.request("/auth/smartthings", { headers: { cookie: kidCookie } })).status,
    ).toBe(403);

    const del = await app.request(`/family/${kid.id}`, {
      method: "DELETE",
      headers: { cookie: owner },
    });
    expect(del.status).toBe(200);
    expect((await app.request("/auth/me", { headers: { cookie: kidCookie } })).status).toBe(401);
  });

  it("scopes the OAuth state cookie to the proxied API path", async () => {
    const auth = new MemoryAuthStore();
    const app = createApp({
      env: {
        ...env,
        API_PUBLIC_URL: "https://heat.example.org/api",
        WEB_PUBLIC_URL: "https://heat.example.org",
      },
      auth,
      ping: async () => {},
      saveTokens: async () => {},
      onDeviceEvents: async () => {},
    });
    const cookie = await signUpOwner(app);
    const res = await app.request("/auth/smartthings", { headers: { cookie } });
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toContain("Path=/api/auth/smartthings");
    expect(set).toContain("Secure");
  });
});

describe("controls API", () => {
  it("needs a session and maps control errors to HTTP", async () => {
    const store = new MemoryStore();
    store.deviceList.push({
      id: "hp",
      userId: "owner",
      label: "Heat pump",
      binaryId: null,
      temperatureReference: "water",
      components: ["main", "INDOOR"],
    });
    const controls = new Controls({
      store,
      boosts: new MemoryBoostStore(),
      execute: async () => {
        throw new NotLinkedError();
      },
    });
    const app = createApp({
      env,
      auth: new MemoryAuthStore(),
      store,
      controls,
      ping: async () => {},
      saveTokens: async () => {},
      onDeviceEvents: async () => {},
    });
    expect((await app.request("/devices/hp/controls")).status).toBe(401);
    const cookie = await signUpOwner(app);
    const state = await app.request("/devices/hp/controls", { headers: { cookie } });
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      heating: { on: null, range: { min: 25, max: 55 } },
    });

    const bad = await app.request("/devices/hp/controls/heating", json({ mode: "turbo" }, cookie));
    expect(bad.status).toBe(400);
    const range = await app.request("/devices/hp/controls/dhw", json({ setpoint: 90 }, cookie));
    expect(await range.json()).toEqual({ error: "invalid_setpoint" });
    const unlinked = await app.request("/devices/hp/controls/heating", json({ on: true }, cookie));
    expect(unlinked.status).toBe(409);
    expect(await unlinked.json()).toEqual({ error: "not_linked" });
    const missing = await app.request("/devices/x/boost", json({ target: 50 }, cookie));
    expect(missing.status).toBe(404);
  });
});
