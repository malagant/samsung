import type { TokenSet } from "../smartthings/oauth.js";
import type { DeviceSummary } from "../smartthings/types.js";
import type { FsvReading, TelemetryRow } from "./mapping.js";

export interface Account {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  pollingStatus: string;
  consecutiveFailures: number;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  label: string;
  binaryId: string | null;
  temperatureReference: string | null;
}

/** Persistence the poller needs. Implemented with Drizzle in drizzle-store.ts. */
export interface TelemetryStore {
  saveTokens(tokens: TokenSet): Promise<void>;
  accounts(): Promise<Account[]>;
  updateTokens(userId: string, tokens: TokenSet): Promise<void>;
  recordPoll(userId: string, ok: boolean, at: Date): Promise<void>;
  devices(userId: string): Promise<DeviceRecord[]>;
  upsertDevices(userId: string, devices: DeviceSummary[]): Promise<void>;
  lastTelemetry(deviceId: string): Promise<TelemetryRow | null>;
  insertTelemetry(deviceId: string, row: TelemetryRow): Promise<void>;
  saveFsv(deviceId: string, fsv: FsvReading): Promise<void>;
  /** Adds `n` calls to the current month and returns the new total. */
  countCalls(month: string, n: number): Promise<number>;
  callsThisMonth(month: string): Promise<number>;
  telemetryRange(deviceId: string, from: Date, to: Date): Promise<TelemetryRow[]>;
  allDevices(): Promise<DeviceRecord[]>;
  latestFsv(deviceId: string): Promise<{ reportedAt: Date; values: Record<string, number> } | null>;
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}
