import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import pino from "pino";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { DrizzleTelemetryStore } from "./telemetry/drizzle-store.js";
import { Poller } from "./telemetry/poller.js";

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const db = createDb(env.DATABASE_URL);

// Migrations ship next to dist/ (see Dockerfile) and in the source tree for dev.
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });

const store = new DrizzleTelemetryStore(db);
const poller = new Poller({ env, store, log });

const app = createApp({
  env,
  store,
  accountStatus: () => store.accountStatus(),
  ping: async () => {
    await db.execute(sql`select 1`);
  },
  saveTokens: async (tokens) => {
    await store.saveTokens(tokens);
    log.info("SmartThings account linked");
    poller.requestPoll();
  },
  onDeviceEvents: async (events) => {
    log.debug({ count: events.length }, "SmartThings events");
    if (events.length > 0) poller.requestPoll();
  },
});

if (env.SMARTTHINGS_CLIENT_ID) poller.start();
else log.warn("SMARTTHINGS_CLIENT_ID is empty, polling disabled");

const server = serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  log.info({ port: info.port }, "api listening");
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    poller.stop();
    server.close(() => process.exit(0));
  });
}
