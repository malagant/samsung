import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
      accountStatus: () => store.accountStatus(),
      ping: async () => {},
      saveTokens: async () => {},
      onDeviceEvents: async () => {},
      now: () => new Date("2026-11-10T11:00:00Z"),
    });
    const res = await app.request("/devices/hp-1/telemetry?hours=6");
    const body = (await res.json()) as { rows: unknown[]; summary: { samples: number } };
    expect(body.summary.samples).toBe(1);
    expect(body.rows[0]).not.toHaveProperty("rawIndoorCycleData");
    const fsv = (await (await app.request("/devices/hp-1/fsv")).json()) as {
      values: Record<string, number>;
    };
    expect(fsv.values["2021"]).toBe(38);
    const st = (await (await app.request("/smartthings/status")).json()) as Record<string, unknown>;
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
});
