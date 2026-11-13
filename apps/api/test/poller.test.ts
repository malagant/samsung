import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env.js";
import { Poller } from "../src/telemetry/poller.js";
import sample from "./fixtures/st-status-ehs-mono.json" with { type: "json" };
import { MemoryStore } from "./memory-store.js";

const env = loadEnv({
  NODE_ENV: "test",
  API_PUBLIC_URL: "http://localhost:8787",
  WEB_PUBLIC_URL: "http://localhost:5173",
  DATABASE_URL: "postgres://test",
  SESSION_SECRET: "test-secret-test-secret",
  SMARTTHINGS_CLIENT_ID: "cid",
  SMARTTHINGS_CLIENT_SECRET: "csecret",
  SMARTTHINGS_REDIRECT_URI: "http://localhost:8787/auth/smartthings/callback",
});
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const now = new Date("2026-11-10T10:40:00Z");

function fakeSmartThings(overrides: Partial<Record<string, () => Response>> = {}) {
  const seen: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    for (const [k, f] of Object.entries(overrides)) if (url.includes(k) && f) return f();
    if (url.endsWith("/oauth/token")) {
      return Response.json({ access_token: "new-at", refresh_token: "new-rt", expires_in: 86400 });
    }
    if (url.endsWith("/devices")) {
      return Response.json({
        items: [
          {
            deviceId: "hp-1",
            label: "Wärmepumpe",
            components: [{ id: "INDOOR", capabilities: [{ id: "samsungce.ehsCycleData" }] }],
          },
          {
            deviceId: "tv-1",
            label: "TV",
            components: [{ id: "main", capabilities: [{ id: "switch" }] }],
          },
        ],
      });
    }
    if (url.endsWith("/devices/hp-1/status")) return Response.json(sample);
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

async function linked(store: MemoryStore, expiresAt = new Date(now.getTime() + 3600_000)) {
  await store.saveTokens({
    accessToken: "at",
    refreshToken: "rt",
    expiresAt,
    scopes: "r:devices:*",
  });
}

describe("Poller", () => {
  it("discovers heat pumps, stores a telemetry row and FSVs, and counts calls", async () => {
    const store = new MemoryStore();
    await linked(store);
    const { fetchImpl } = fakeSmartThings();
    const poller = new Poller({ env, store, log, fetchImpl, now: () => now });

    const next = await poller.tick();

    expect(store.deviceList.map((d) => d.id)).toEqual(["hp-1"]);
    expect(store.rows.get("hp-1")?.[0]).toMatchObject({
      flowTemp: 32.2,
      compressorFreq: 42,
      outdoorTemp: 5,
    });
    expect(store.fsv[0]?.fsv.values["2021"]).toBe(38);
    expect(store.calls.get("2026-11")).toBe(2); // /devices + /status
    expect(store.polls).toEqual([true]);
    expect(next).toBeGreaterThanOrEqual(env.SMARTTHINGS_POLL_INTERVAL_SECONDS);
  });

  it("does not rediscover devices on every round", async () => {
    const store = new MemoryStore();
    await linked(store);
    const { fetchImpl, seen } = fakeSmartThings();
    const poller = new Poller({ env, store, log, fetchImpl, now: () => now });
    await poller.tick();
    await poller.tick();
    expect(seen.filter((u) => u.endsWith("/devices"))).toHaveLength(1);
    expect(store.rows.get("hp-1")).toHaveLength(2);
  });

  it("refreshes an expiring token before calling SmartThings", async () => {
    const store = new MemoryStore();
    await linked(store, new Date(now.getTime() + 60_000));
    const { fetchImpl, seen } = fakeSmartThings();
    await new Poller({ env, store, log, fetchImpl, now: () => now }).tick();
    expect(seen[0]).toContain("/oauth/token");
    expect(store.account?.accessToken).toBe("new-at");
  });

  it("backs off when SmartThings rate-limits", async () => {
    const store = new MemoryStore();
    await linked(store);
    const { fetchImpl } = fakeSmartThings({
      "/devices": () =>
        new Response("slow down", { status: 429, headers: { "retry-after": "1200" } }),
    });
    const next = await new Poller({ env, store, log, fetchImpl, now: () => now }).tick();
    expect(store.polls).toEqual([false]);
    expect(next).toBe(1200);
  });

  it("does nothing without a linked account", async () => {
    const store = new MemoryStore();
    const { fetchImpl } = fakeSmartThings();
    await new Poller({ env, store, log, fetchImpl, now: () => now }).tick();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Poller.execute", () => {
  it("sends commands with the owner's token and reads the status back", async () => {
    const store = new MemoryStore();
    await linked(store);
    const bodies: unknown[] = [];
    const { fetchImpl, seen } = fakeSmartThings({
      "/devices/hp-1/commands": () =>
        Response.json({ results: [{ id: "c1", status: "ACCEPTED" }] }),
    });
    const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return fetchImpl(input, init);
    }) as typeof fetch;
    const poller = new Poller({ env, store, log, fetchImpl: wrapped, now: () => now });
    await poller.tick();

    const row = await poller.execute(
      "hp-1",
      [{ component: "INDOOR", capability: "switch", command: "off" }],
      { refresh: true },
    );
    expect(bodies.at(-1)).toEqual({
      commands: [{ component: "INDOOR", capability: "switch", command: "off", arguments: [] }],
    });
    expect(seen.at(-1)).toContain("/devices/hp-1/status");
    expect(row?.ts).toEqual(now);
    expect(store.rows.get("hp-1")).toHaveLength(2);
  });

  it("refuses devices without a linked account", async () => {
    const poller = new Poller({ env, store: new MemoryStore(), log, now: () => now });
    await expect(poller.execute("hp-1", [], { refresh: false })).rejects.toThrow("no linked");
  });

  it("hands every polled row to the post-poll hook", async () => {
    const store = new MemoryStore();
    await linked(store);
    const { fetchImpl } = fakeSmartThings();
    const onPolled = vi.fn(async () => {});
    await new Poller({ env, store, log, fetchImpl, now: () => now, onPolled }).tick();
    expect(onPolled).toHaveBeenCalledWith("hp-1", expect.objectContaining({ ts: now }));
  });
});
