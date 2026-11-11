import type { TokenSet } from "../src/smartthings/oauth.js";
import type { DeviceSummary } from "../src/smartthings/types.js";
import type { FsvReading, TelemetryRow } from "../src/telemetry/mapping.js";
import type { Account, DeviceRecord, TelemetryStore } from "../src/telemetry/store.js";

export class MemoryStore implements TelemetryStore {
  account: (Account & { lastSuccessfulPoll: Date | null }) | null = null;
  deviceList: DeviceRecord[] = [];
  rows = new Map<string, TelemetryRow[]>();
  fsv: Array<{ deviceId: string; fsv: FsvReading }> = [];
  calls = new Map<string, number>();
  polls: boolean[] = [];

  async saveTokens(t: TokenSet) {
    this.account = {
      userId: "owner",
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: t.expiresAt,
      pollingStatus: "active",
      consecutiveFailures: 0,
      lastSuccessfulPoll: null,
    };
  }
  async accounts() {
    return this.account ? [this.account] : [];
  }
  async updateTokens(_u: string, t: TokenSet) {
    if (this.account)
      Object.assign(this.account, {
        accessToken: t.accessToken,
        refreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
      });
  }
  async recordPoll(_u: string, ok: boolean) {
    this.polls.push(ok);
  }
  async devices() {
    return this.deviceList;
  }
  async allDevices() {
    return this.deviceList;
  }
  async upsertDevices(userId: string, list: DeviceSummary[]) {
    for (const d of list) {
      if (!this.deviceList.some((x) => x.id === d.deviceId)) {
        this.deviceList.push({
          id: d.deviceId,
          userId,
          label: d.label ?? "Heat pump",
          binaryId: null,
          temperatureReference: "water",
        });
      }
    }
  }
  async lastTelemetry(id: string) {
    return this.rows.get(id)?.at(-1) ?? null;
  }
  async insertTelemetry(id: string, row: TelemetryRow) {
    this.rows.set(id, [...(this.rows.get(id) ?? []), row]);
  }
  async saveFsv(deviceId: string, fsv: FsvReading) {
    this.fsv.push({ deviceId, fsv });
  }
  async latestFsv(id: string) {
    const f = this.fsv.filter((x) => x.deviceId === id).at(-1)?.fsv;
    return f ? { reportedAt: f.reportedAt ?? new Date(0), values: f.values } : null;
  }
  async countCalls(m: string, n: number) {
    const v = (this.calls.get(m) ?? 0) + n;
    this.calls.set(m, v);
    return v;
  }
  async callsThisMonth(m: string) {
    return this.calls.get(m) ?? 0;
  }
  async telemetryRange(id: string, from: Date, to: Date) {
    return (this.rows.get(id) ?? []).filter((r) => r.ts >= from && r.ts <= to);
  }
}
