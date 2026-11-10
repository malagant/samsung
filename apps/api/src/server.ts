import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import pino from "pino";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const db = createDb(env.DATABASE_URL);

const app = createApp({
  env,
  ping: async () => {
    await db.execute(sql`select 1`);
  },
  saveTokens: async () => {
    // Step 3: upsert into smartthings_accounts for the logged-in owner.
    log.info("SmartThings tokens received");
  },
  onDeviceEvents: async (events) => {
    // Step 3: map capability events to telemetry rows.
    log.debug({ count: events.length }, "SmartThings events");
  },
});

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  log.info({ port: info.port }, "api listening");
});
