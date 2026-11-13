import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DrizzleAuthStore } from "../src/auth/drizzle-auth-store.js";
import { DrizzleBoostStore } from "../src/controls/boost-store.js";
import { createDb, type Db } from "../src/db/client.js";
import { loadEnv } from "../src/env.js";
import type { DeviceStatus } from "../src/smartthings/types.js";
import { DrizzleTelemetryStore, FAILING_AFTER } from "../src/telemetry/drizzle-store.js";
import { statusToTelemetry } from "../src/telemetry/mapping.js";
import sample from "./fixtures/st-status-ehs-mono.json" with { type: "json" };

/** Runs against a real database when TEST_DATABASE_URL is set (CI does this). */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("DrizzleTelemetryStore (Postgres)", () => {
  let db: Db;
  let store: DrizzleTelemetryStore;

  beforeAll(async () => {
    db = createDb(url ?? "");
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    store = new DrizzleTelemetryStore(db);
  });
  afterAll(async () => {
    await db.$client.end();
  });

  it("links an account, stores devices, telemetry and FSVs, and serves them", async () => {
    await store.saveTokens({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: new Date(),
      scopes: "s",
    });
    await store.saveTokens({
      accessToken: "b",
      refreshToken: "r2",
      expiresAt: new Date(),
      scopes: "s",
    });
    const accounts = await store.accounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.accessToken).toBe("b");
    const userId = accounts[0]?.userId ?? "";

    await store.upsertDevices(userId, [
      { deviceId: "hp-1", label: "Wärmepumpe", components: [{ id: "main" }, { id: "INDOOR" }] },
    ]);
    expect((await store.devices(userId)).map((d) => d.id)).toEqual(["hp-1"]);

    const t = new Date("2026-11-10T10:40:00Z");
    const row = statusToTelemetry(sample as unknown as DeviceStatus, { now: t });
    await store.insertTelemetry("hp-1", row);
    await store.insertTelemetry("hp-1", row); // duplicate poll is ignored
    expect(await store.lastTelemetry("hp-1")).toMatchObject({ flowTemp: 32.2, energyWh: 10514547 });

    await store.saveFsv("hp-1", {
      reportedAt: new Date("2026-10-27T06:12:00Z"),
      values: { "2021": 38 },
    });

    expect(await store.countCalls("2026-11", 1)).toBe(1);
    expect(await store.countCalls("2026-11", 2)).toBe(3);
    expect(await store.callsThisMonth("2026-11")).toBe(3);

    const env = loadEnv({
      NODE_ENV: "test",
      API_PUBLIC_URL: "http://localhost:8787",
      WEB_PUBLIC_URL: "http://localhost:5173",
      DATABASE_URL: url,
      SESSION_SECRET: "test-secret-test-secret",
      SMARTTHINGS_REDIRECT_URI: "http://localhost:8787/auth/smartthings/callback",
    });
    const app = createApp({
      env,
      store,
      auth: new DrizzleAuthStore(db),
      accountStatus: () => store.accountStatus(),
      ping: async () => {},
      saveTokens: async () => {},
      onDeviceEvents: async () => {},
      now: () => new Date("2026-11-10T11:00:00Z"),
    });
    expect((await app.request("/devices")).status).toBe(401);
    // Linking SmartThings first left a placeholder owner; setup completes that same user.
    const setup = await app.request("/auth/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.org", password: "correct horse battery" }),
    });
    expect(setup.status).toBe(201);
    const [a] = await store.accounts();
    expect(((await setup.json()) as { user: { id: string } }).user.id).toBe(a?.userId);
    const cookie = (setup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const get = (path: string) => app.request(path, { headers: { cookie } });
    const res = await get("/devices/hp-1/telemetry?hours=6");
    const body = (await res.json()) as { rows: unknown[]; summary: { samples: number } };
    expect(body.summary.samples).toBe(1);
    expect(body.rows[0]).not.toHaveProperty("rawIndoorCycleData");
    const fsv = (await (await get("/devices/hp-1/fsv")).json()) as {
      values: Record<string, number>;
    };
    expect(fsv.values["2021"]).toBe(38);
    const st = (await (await get("/smartthings/status")).json()) as Record<string, unknown>;
    expect(st).toMatchObject({ linked: true, pollingStatus: "active", callsThisMonth: 3 });
  });

  it("marks the account as failing after repeated errors and recovers on success", async () => {
    const [a] = await store.accounts();
    for (let i = 0; i < FAILING_AFTER; i++)
      await store.recordPoll(a?.userId ?? "", false, new Date());
    expect((await store.accountStatus())?.pollingStatus).toBe("failing");
    await store.recordPoll(a?.userId ?? "", true, new Date());
    expect((await store.accountStatus())?.pollingStatus).toBe("active");
  });
  it("stores family members and sessions, and drops sessions with the member", async () => {
    const auth = new DrizzleAuthStore(db);
    expect(await auth.setupRequired()).toBe(false);
    const owner = await auth.findByEmail("OWNER@example.org");
    expect(owner?.role).toBe("owner");
    const kid = await auth.addFamily(owner?.id ?? "", "kid@example.org", "hash", "Kid");
    expect(await auth.family(owner?.id ?? "")).toEqual([kid]);
    const now = new Date("2026-11-10T11:00:00Z");
    await auth.createSession("t1", kid.id, new Date(now.getTime() + 60_000));
    await auth.createSession("t2", kid.id, new Date(now.getTime() - 60_000));
    expect(await auth.sessionUser("t1", now)).toEqual(kid);
    expect(await auth.sessionUser("t2", now)).toBeNull();
    expect(await auth.removeFamily(kid.id, kid.id)).toBe(false);
    expect(await auth.removeFamily(owner?.id ?? "", kid.id)).toBe(true);
    expect(await auth.sessionUser("t1", now)).toBeNull();
  });
  it("stores device components, DHW status and boosts", async () => {
    const [d] = await store.allDevices();
    expect(d?.components.length).toBeGreaterThan(0);
    const last = await store.lastTelemetry("hp-1");
    expect(last).toHaveProperty("dhwStatus");

    const boosts = new DrizzleBoostStore(db);
    const b = await boosts.create({
      deviceId: "hp-1",
      startedBy: null,
      target: 55,
      startedAt: new Date("2026-11-12T08:00:00Z"),
      endsAt: new Date("2026-11-12T10:00:00Z"),
      previousSetpoint: 48,
      previousOn: false,
    });
    expect((await boosts.current("hp-1"))?.id).toBe(b.id);
    await boosts.update(b.id, { status: "done", reason: "target_reached", finishedAt: new Date() });
    expect(await boosts.current("hp-1")).toBeNull();
    expect((await boosts.latest("hp-1"))?.reason).toBe("target_reached");
  });
});
