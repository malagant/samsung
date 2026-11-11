import type { Logger } from "pino";
import type { Env } from "../env.js";
import { pollIntervalSeconds } from "../smartthings/budget.js";
import { RateLimitedError, SmartThingsClient } from "../smartthings/client.js";
import { needsRefresh, refreshTokens } from "../smartthings/oauth.js";
import { isEhsDevice, readFsv, statusToTelemetry } from "./mapping.js";
import { type Account, monthKey, type TelemetryStore } from "./store.js";

export interface PollerDeps {
  env: Env;
  store: TelemetryStore;
  log: Pick<Logger, "info" | "warn" | "error" | "debug">;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

/** Re-discover devices once a day; every discovery costs one call. */
const DISCOVERY_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Polls every linked SmartThings account: one status call per heat pump,
 * paced so the monthly call budget lasts. Webhook events trigger an early poll.
 */
export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastDiscovery = new Map<string, number>();
  private earlyPollAt = 0;
  private readonly now: () => Date;

  constructor(private readonly deps: PollerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  start() {
    this.schedule(5);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Called for webhook events: poll soon, but at most once a minute. */
  requestPoll() {
    const t = this.now().getTime();
    if (t - this.earlyPollAt < 60_000) return;
    this.earlyPollAt = t;
    this.schedule(2);
  }

  private schedule(seconds: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loop(), seconds * 1000);
    this.timer.unref?.();
  }

  private async loop() {
    let next = this.deps.env.SMARTTHINGS_POLL_INTERVAL_SECONDS;
    try {
      next = await this.tick();
    } catch (err) {
      this.deps.log.error({ err }, "poll loop failed");
    }
    this.schedule(next);
  }

  /** One round over all accounts. Returns seconds until the next round. */
  async tick(): Promise<number> {
    if (this.running) return this.deps.env.SMARTTHINGS_POLL_INTERVAL_SECONDS;
    this.running = true;
    let devicesPolled = 0;
    let backoff = 0;
    try {
      for (const account of await this.deps.store.accounts()) {
        if (account.pollingStatus === "paused") continue;
        try {
          devicesPolled += await this.pollAccount(account);
          await this.deps.store.recordPoll(account.userId, true, this.now());
        } catch (err) {
          if (err instanceof RateLimitedError)
            backoff = Math.max(backoff, Number(err.retryAfter) || 900);
          this.deps.log.warn({ err, userId: account.userId }, "poll failed");
          await this.deps.store.recordPoll(account.userId, false, this.now());
        }
      }
    } finally {
      this.running = false;
    }
    const used = await this.deps.store.callsThisMonth(monthKey(this.now()));
    const paced = pollIntervalSeconds({
      monthlyBudget: this.deps.env.SMARTTHINGS_MONTHLY_CALL_BUDGET,
      usedThisMonth: used,
      now: this.now(),
      callsPerPoll: Math.max(1, devicesPolled),
    });
    return Math.max(
      backoff,
      this.deps.env.SMARTTHINGS_POLL_INTERVAL_SECONDS,
      Math.min(paced, 24 * 3600),
    );
  }

  private client(account: Account) {
    let token = account.accessToken;
    let expiresAt = account.expiresAt;
    let refreshToken = account.refreshToken;
    const month = monthKey(this.now());
    return new SmartThingsClient({
      baseUrl: this.deps.env.SMARTTHINGS_API_URL,
      ...(this.deps.fetchImpl ? { fetchImpl: this.deps.fetchImpl } : {}),
      getAccessToken: async () => {
        if (needsRefresh(expiresAt, this.now())) {
          const t = await refreshTokens(this.deps.env, refreshToken, this.deps.fetchImpl);
          await this.deps.store.updateTokens(account.userId, t);
          token = t.accessToken;
          expiresAt = t.expiresAt;
          refreshToken = t.refreshToken;
        }
        return token;
      },
      onCall: () => void this.deps.store.countCalls(month, 1),
    });
  }

  private async pollAccount(account: Account): Promise<number> {
    const st = this.client(account);
    const last = this.lastDiscovery.get(account.userId) ?? 0;
    let devices = await this.deps.store.devices(account.userId);
    if (devices.length === 0 || this.now().getTime() - last > DISCOVERY_INTERVAL_MS) {
      const list = await st.listDevices();
      const ehs = list.items.filter(isEhsDevice);
      await this.deps.store.upsertDevices(account.userId, ehs);
      this.lastDiscovery.set(account.userId, this.now().getTime());
      devices = await this.deps.store.devices(account.userId);
    }
    for (const d of devices) {
      const status = await st.deviceStatus(d.id);
      const prev = await this.deps.store.lastTelemetry(d.id);
      const row = statusToTelemetry(status, {
        now: this.now(),
        previousEnergyWh: prev?.energyWh ?? null,
      });
      await this.deps.store.insertTelemetry(d.id, row);
      const fsv = readFsv(status);
      if (fsv && Object.keys(fsv.values).length > 0) await this.deps.store.saveFsv(d.id, fsv);
    }
    return devices.length;
  }
}
