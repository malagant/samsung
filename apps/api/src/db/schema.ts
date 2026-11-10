import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const role = pgEnum("role", ["owner", "family"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: role("role").notNull().default("owner"),
  /** Family members point at the owner whose devices they can see. */
  ownerId: uuid("owner_id"),
  shortCycleNotifications: boolean("short_cycle_notifications").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** OAuth tokens for the owner's SmartThings account. */
export const smartthingsAccounts = pgTable("smartthings_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  installedAppId: text("installed_app_id"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scopes: text("scopes").notNull(),
  pollingStatus: text("polling_status").notNull().default("active"),
  lastSuccessfulPoll: timestamp("last_successful_poll", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  webhooksEnabled: boolean("webhooks_enabled").notNull().default(false),
});

export const devices = pgTable("devices", {
  id: text("id").primaryKey(), // SmartThings deviceId
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  manufacturer: text("manufacturer"),
  binaryId: text("binary_id"),
  components: jsonb("components").$type<string[]>().notNull().default([]),
  temperatureReference: text("temperature_reference").$type<"water" | "air">().default("water"),
  wcZone: text("wc_zone").$type<"zone1" | "zone2">().notNull().default("zone1"),
  linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per poll or webhook event. Raw cycle data is kept so history can be
 * re-decoded when the reverse-engineered layout improves.
 */
export const telemetry = pgTable(
  "telemetry",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    cycleDataTs: timestamp("cycle_data_ts", { withTimezone: true }),
    mainSystemStatus: text("main_system_status"),
    heatingCircuitStatus: text("heating_circuit_status"),
    operatingMode: text("operating_mode"),
    dhwOperatingMode: text("dhw_operating_mode"),
    flowTemp: doublePrecision("flow_temp"),
    flowSetpoint: doublePrecision("flow_setpoint"),
    returnTemp: doublePrecision("return_temp"),
    outdoorTemp: doublePrecision("outdoor_temp"),
    dhwTemp: doublePrecision("dhw_temp"),
    dhwSetpoint: doublePrecision("dhw_setpoint"),
    flowRate: doublePrecision("flow_rate"),
    compressorFreq: doublePrecision("compressor_freq"),
    inverterPumpPercent: doublePrecision("inverter_pump_percent"),
    energyWh: doublePrecision("energy_wh"),
    deltaEnergyWh: doublePrecision("delta_energy_wh"),
    diverterValvePosition: text("diverter_valve_position"),
    defrostActive: boolean("defrost_active"),
    rawOutdoorCycleData: text("raw_outdoor_cycle_data"),
    rawIndoorCycleData: text("raw_indoor_cycle_data"),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.ts] }), index("telemetry_ts_idx").on(t.ts)],
);

export const hourlySummaries = pgTable(
  "hourly_summaries",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    heatingMinutes: doublePrecision("heating_minutes").notNull().default(0),
    dhwMinutes: doublePrecision("dhw_minutes").notNull().default(0),
    defrostMinutes: doublePrecision("defrost_minutes").notNull().default(0),
    energyInWh: doublePrecision("energy_in_wh").notNull().default(0),
    heatOutWh: doublePrecision("heat_out_wh").notNull().default(0),
    outdoorMin: doublePrecision("outdoor_min"),
    outdoorMax: doublePrecision("outdoor_max"),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.hour] })],
);

/** FSV values as reported by SmartThings (only ~20 are exposed). */
export const fsvSnapshots = pgTable(
  "fsv_snapshots",
  {
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    values: jsonb("values").$type<Record<string, number>>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.reportedAt] })],
);

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"dhw" | "wl">().notNull(),
  /** Cron expression in Europe/Berlin. */
  cron: text("cron").notNull(),
  params: jsonb("params").$type<Record<string, unknown>>().notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
});

export const shares = pgTable("shares", {
  token: text("token").primaryKey(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  windowHours: integer("window_hours").notNull().default(24),
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
