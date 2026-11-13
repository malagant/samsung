import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  apiCallCounts,
  devices,
  fsvSnapshots,
  smartthingsAccounts,
  telemetry,
  users,
} from "../db/schema.js";
import type { TokenSet } from "../smartthings/oauth.js";
import type { DeviceSummary } from "../smartthings/types.js";
import type { FsvReading, TelemetryRow } from "./mapping.js";
import type { Account, DeviceRecord, TelemetryStore } from "./store.js";

/** After this many failed polls in a row the account is shown as failing. */
export const FAILING_AFTER = 5;

type TelemetrySelect = typeof telemetry.$inferSelect;

function toRow(r: TelemetrySelect): TelemetryRow {
  const { deviceId: _d, ...rest } = r;
  return rest;
}

export class DrizzleTelemetryStore implements TelemetryStore {
  constructor(private readonly db: Db) {}

  /**
   * Single-household app: the SmartThings account belongs to the owner. Until
   * app login exists, the owner row is created here without a usable password.
   */
  private async ownerId(): Promise<string> {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "owner"))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await this.db
      .insert(users)
      .values({ email: "owner@localhost", passwordHash: "!", role: "owner" })
      .returning({ id: users.id });
    if (!created) throw new Error("could not create owner");
    return created.id;
  }

  async saveTokens(t: TokenSet) {
    const userId = await this.ownerId();
    const values = {
      userId,
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      scopes: t.scopes,
      installedAppId: t.installedAppId ?? null,
      pollingStatus: "active",
      consecutiveFailures: 0,
    };
    await this.db
      .insert(smartthingsAccounts)
      .values(values)
      .onConflictDoUpdate({ target: smartthingsAccounts.userId, set: values });
  }

  async accounts(): Promise<Account[]> {
    return this.db
      .select({
        userId: smartthingsAccounts.userId,
        accessToken: smartthingsAccounts.accessToken,
        refreshToken: smartthingsAccounts.refreshToken,
        expiresAt: smartthingsAccounts.expiresAt,
        pollingStatus: smartthingsAccounts.pollingStatus,
        consecutiveFailures: smartthingsAccounts.consecutiveFailures,
      })
      .from(smartthingsAccounts);
  }

  async accountStatus() {
    const [r] = await this.db
      .select({
        pollingStatus: smartthingsAccounts.pollingStatus,
        lastSuccessfulPoll: smartthingsAccounts.lastSuccessfulPoll,
      })
      .from(smartthingsAccounts)
      .limit(1);
    return r ?? null;
  }

  async updateTokens(userId: string, t: TokenSet) {
    await this.db
      .update(smartthingsAccounts)
      .set({
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scopes: t.scopes,
      })
      .where(eq(smartthingsAccounts.userId, userId));
  }

  async recordPoll(userId: string, ok: boolean, at: Date) {
    if (ok) {
      await this.db
        .update(smartthingsAccounts)
        .set({ lastSuccessfulPoll: at, consecutiveFailures: 0, pollingStatus: "active" })
        .where(eq(smartthingsAccounts.userId, userId));
      return;
    }
    await this.db
      .update(smartthingsAccounts)
      .set({
        consecutiveFailures: sql`${smartthingsAccounts.consecutiveFailures} + 1`,
        pollingStatus: sql`case when ${smartthingsAccounts.consecutiveFailures} + 1 >= ${FAILING_AFTER} then 'failing' else ${smartthingsAccounts.pollingStatus} end`,
      })
      .where(eq(smartthingsAccounts.userId, userId));
  }

  async devices(userId: string): Promise<DeviceRecord[]> {
    return this.db
      .select({
        id: devices.id,
        userId: devices.userId,
        label: devices.label,
        binaryId: devices.binaryId,
        temperatureReference: devices.temperatureReference,
        components: devices.components,
      })
      .from(devices)
      .where(eq(devices.userId, userId));
  }

  async allDevices(): Promise<DeviceRecord[]> {
    return this.db
      .select({
        id: devices.id,
        userId: devices.userId,
        label: devices.label,
        binaryId: devices.binaryId,
        temperatureReference: devices.temperatureReference,
        components: devices.components,
      })
      .from(devices)
      .orderBy(asc(devices.linkedAt));
  }

  async upsertDevices(userId: string, list: DeviceSummary[]) {
    for (const d of list) {
      const values = {
        id: d.deviceId,
        userId,
        label: d.label ?? d.name ?? "Heat pump",
        manufacturer: d.manufacturerName ?? d.ocf?.manufacturerName ?? null,
        binaryId: d.ocf?.modelNumber ?? null,
        components: (d.components ?? []).map((c) => c.id),
      };
      await this.db
        .insert(devices)
        .values(values)
        .onConflictDoUpdate({
          target: devices.id,
          set: { label: values.label, components: values.components },
        });
    }
  }

  async lastTelemetry(deviceId: string) {
    const [r] = await this.db
      .select()
      .from(telemetry)
      .where(eq(telemetry.deviceId, deviceId))
      .orderBy(desc(telemetry.ts))
      .limit(1);
    return r ? toRow(r) : null;
  }

  async insertTelemetry(deviceId: string, row: TelemetryRow) {
    await this.db
      .insert(telemetry)
      .values({ deviceId, ...row })
      .onConflictDoNothing();
  }

  async saveFsv(deviceId: string, fsv: FsvReading) {
    await this.db
      .insert(fsvSnapshots)
      .values({ deviceId, reportedAt: fsv.reportedAt ?? new Date(), values: fsv.values })
      .onConflictDoNothing();
  }

  async latestFsv(deviceId: string) {
    const [r] = await this.db
      .select({ reportedAt: fsvSnapshots.reportedAt, values: fsvSnapshots.values })
      .from(fsvSnapshots)
      .where(eq(fsvSnapshots.deviceId, deviceId))
      .orderBy(desc(fsvSnapshots.reportedAt))
      .limit(1);
    return r ?? null;
  }

  async countCalls(month: string, n: number) {
    const [r] = await this.db
      .insert(apiCallCounts)
      .values({ month, calls: n })
      .onConflictDoUpdate({
        target: apiCallCounts.month,
        set: { calls: sql`${apiCallCounts.calls} + ${n}` },
      })
      .returning({ calls: apiCallCounts.calls });
    return r?.calls ?? n;
  }

  async callsThisMonth(month: string) {
    const [r] = await this.db
      .select({ calls: apiCallCounts.calls })
      .from(apiCallCounts)
      .where(eq(apiCallCounts.month, month));
    return r?.calls ?? 0;
  }

  async telemetryRange(deviceId: string, from: Date, to: Date) {
    const rows = await this.db
      .select()
      .from(telemetry)
      .where(and(eq(telemetry.deviceId, deviceId), gte(telemetry.ts, from), lte(telemetry.ts, to)))
      .orderBy(asc(telemetry.ts));
    return rows.map(toRow);
  }
}
