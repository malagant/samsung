import type { Command } from "../smartthings/client.js";
import type { TelemetryRow } from "../telemetry/mapping.js";
import type { DeviceRecord, TelemetryStore } from "../telemetry/store.js";
import type { Boost, BoostStore } from "./boost-store.js";
import {
  type CircuitInput,
  checkSetpoint,
  circuitCommands,
  componentFor,
  type DhwMode,
  type HeatingMode,
  setpointRanges,
} from "./commands.js";

/** Sends commands to a device; with `refresh` it reads the status back and stores it. */
export type Executor = (
  deviceId: string,
  commands: Command[],
  opts: { refresh: boolean },
) => Promise<TelemetryRow | null>;

export class ControlError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid_setpoint"
      | "boost_active"
      | "no_boost"
      | "already_at_target"
      | "nothing_to_do",
    readonly status: 400 | 404 | 409,
  ) {
    super(code);
  }
}

export const BOOST_MAX_MINUTES = 120;
/** Restore commands are retried this often before the boost is marked failed. */
export const MAX_RESTORE_ATTEMPTS = 3;

export interface ControlsDeps {
  store: Pick<TelemetryStore, "allDevices" | "lastTelemetry" | "latestFsv">;
  boosts: BoostStore;
  execute: Executor;
  now?: () => Date;
}

/**
 * Heat pump controls: heating and DHW circuits, plus the DHW boost that the
 * API runs itself (the unit has no boost that outlasts its own 30-minute limit).
 */
export class Controls {
  private readonly now: () => Date;

  constructor(private readonly deps: ControlsDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async device(id: string): Promise<DeviceRecord> {
    const d = (await this.deps.store.allDevices()).find((x) => x.id === id);
    if (!d) throw new ControlError("not_found", 404);
    return d;
  }

  private async ranges(d: DeviceRecord) {
    const fsv = await this.deps.store.latestFsv(d.id);
    return setpointRanges(fsv?.values ?? null, d.temperatureReference);
  }

  /** Current state as the controls page shows it. */
  async state(deviceId: string) {
    const d = await this.device(deviceId);
    const [last, ranges, boost] = await Promise.all([
      this.deps.store.lastTelemetry(d.id),
      this.ranges(d),
      this.deps.boosts.latest(d.id),
    ]);
    return {
      reportedAt: last?.ts ?? null,
      heating: {
        on: onOff(last?.heatingCircuitStatus),
        mode: last?.operatingMode ?? null,
        setpoint: last?.flowSetpoint ?? null,
        range: ranges.heating,
      },
      dhw: {
        on: onOff(last?.dhwStatus),
        mode: last?.dhwOperatingMode ?? null,
        setpoint: last?.dhwSetpoint ?? null,
        temperature: last?.dhwTemp ?? null,
        range: ranges.dhw,
      },
      boost,
    };
  }

  async heating(deviceId: string, input: CircuitInput<HeatingMode>) {
    const d = await this.device(deviceId);
    const setpoint = await this.validSetpoint(d, "heating", input.setpoint);
    return this.send(d, "heating", { ...input, setpoint });
  }

  async dhw(deviceId: string, input: CircuitInput<DhwMode>) {
    const d = await this.device(deviceId);
    if (await this.deps.boosts.current(d.id)) throw new ControlError("boost_active", 409);
    const setpoint = await this.validSetpoint(d, "dhw", input.setpoint);
    return this.send(d, "dhw", { ...input, setpoint });
  }

  private async validSetpoint(d: DeviceRecord, circuit: "heating" | "dhw", value?: number) {
    if (value === undefined) return undefined;
    const ok = checkSetpoint(value, (await this.ranges(d))[circuit]);
    if (ok === null) throw new ControlError("invalid_setpoint", 400);
    return ok;
  }

  private async send(d: DeviceRecord, role: "heating" | "dhw", input: CircuitInput<string>) {
    const commands = circuitCommands(componentFor(role, d.components), input);
    if (commands.length === 0) throw new ControlError("nothing_to_do", 400);
    await this.deps.execute(d.id, commands, { refresh: true });
    return this.state(d.id);
  }

  async startBoost(deviceId: string, userId: string, target: number, minutes = BOOST_MAX_MINUTES) {
    const d = await this.device(deviceId);
    if (await this.deps.boosts.current(d.id)) throw new ControlError("boost_active", 409);
    const t = await this.validSetpoint(d, "dhw", target);
    if (t === undefined) throw new ControlError("invalid_setpoint", 400);
    const last = await this.deps.store.lastTelemetry(d.id);
    if (last?.dhwTemp != null && last.dhwTemp >= t)
      throw new ControlError("already_at_target", 409);

    const start = this.now();
    const boost = await this.deps.boosts.create({
      deviceId: d.id,
      startedBy: userId,
      target: t,
      startedAt: start,
      endsAt: new Date(start.getTime() + Math.min(minutes, BOOST_MAX_MINUTES) * 60_000),
      previousSetpoint: last?.dhwSetpoint ?? null,
      previousOn: onOff(last?.dhwStatus),
    });
    try {
      await this.deps.execute(
        d.id,
        circuitCommands(componentFor("dhw", d.components), { setpoint: t, on: true }),
        { refresh: true },
      );
    } catch (err) {
      // Nothing changed on the unit, so there is nothing to restore.
      await this.deps.boosts.remove(boost.id);
      throw err;
    }
    return this.state(d.id);
  }

  async cancelBoost(deviceId: string) {
    const d = await this.device(deviceId);
    const b = await this.deps.boosts.current(d.id);
    if (b?.status !== "active") throw new ControlError("no_boost", 409);
    await this.restore(d, b, "cancelled");
    return this.state(d.id);
  }

  /** Called after every poll: ends boosts at target or timeout and verifies restores. */
  async onPoll(deviceId: string, row: TelemetryRow) {
    const b = await this.deps.boosts.current(deviceId);
    if (!b) return;
    const d = await this.device(deviceId);
    if (b.status === "active") {
      const reason =
        row.dhwTemp != null && row.dhwTemp >= b.target
          ? "target_reached"
          : this.now() >= b.endsAt
            ? "timeout"
            : null;
      if (reason) await this.restore(d, b, reason);
      return;
    }
    // restoring: done once the unit reports the previous values again.
    const setpointOk = b.previousSetpoint == null || row.dhwSetpoint === b.previousSetpoint;
    const switchOk = b.previousOn !== false || row.dhwStatus === "off";
    if (setpointOk && switchOk) {
      await this.deps.boosts.update(b.id, { status: "done", finishedAt: this.now() });
    } else if (b.restoreAttempts >= MAX_RESTORE_ATTEMPTS) {
      await this.deps.boosts.update(b.id, { status: "failed", finishedAt: this.now() });
    } else {
      await this.restore(d, b, b.reason ?? "timeout");
    }
  }

  private async restore(d: DeviceRecord, b: Boost, reason: NonNullable<Boost["reason"]>) {
    const commands = circuitCommands(componentFor("dhw", d.components), {
      ...(b.previousSetpoint != null ? { setpoint: b.previousSetpoint } : {}),
      ...(b.previousOn === false ? { on: false } : {}),
    });
    if (commands.length === 0) {
      await this.deps.boosts.update(b.id, { status: "done", reason, finishedAt: this.now() });
      return;
    }
    await this.deps.boosts.update(b.id, {
      status: "restoring",
      reason,
      restoreAttempts: b.restoreAttempts + 1,
    });
    try {
      await this.deps.execute(d.id, commands, { refresh: false });
    } catch {
      // Retried on the next poll; onPoll counts the attempts.
    }
  }
}

function onOff(v: string | null | undefined): boolean | null {
  return v === "on" ? true : v === "off" ? false : null;
}
