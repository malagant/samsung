import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

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
    saveTokens: vi.fn(async () => {}),
    onDeviceEvents: vi.fn(async () => {}),
    fetchImpl: vi.fn(async () => Response.json({})) as unknown as typeof fetch,
  };
  return { app: createApp(deps), deps };
}

describe("api", () => {
  it("serves health", async () => {
    const { app } = setup();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
  });

  it("redirects to SmartThings with a state cookie", async () => {
    const { app } = setup();
    const res = await app.request("/auth/smartthings");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.origin).toBe("https://api.smartthings.com");
    expect(loc.searchParams.get("client_id")).toBe("cid");
    expect(loc.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(res.headers.get("set-cookie")).toContain("st_oauth_state=");
  });

  it("rejects a callback without a matching state", async () => {
    const { app, deps } = setup();
    const res = await app.request("/auth/smartthings/callback?code=x&state=y");
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
