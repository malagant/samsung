import { describe, expect, it } from "vitest";
import {
  checkSetpoint,
  circuitCommands,
  componentFor,
  setpointRanges,
} from "../src/controls/commands.js";
import { Controls } from "../src/controls/controller.js";
import type { Command } from "../src/smartthings/client.js";
import type { TelemetryRow } from "../src/telemetry/mapping.js";
import { MemoryBoostStore } from "./memory-boost-store.js";
import { MemoryStore } from "./memory-store.js";

const t0 = new Date("2026-11-12T08:00:00Z");

function row(p: Partial<TelemetryRow>): TelemetryRow {
  return {
    ts: t0,
    cycleDataTs: null,
    mainSystemStatus: "on",
    heatingCircuitStatus: "on",
    dhwStatus: "off",
    operatingMode: "heat",
    dhwOperatingMode: "eco",
    flowTemp: 32,
    flowSetpoint: 32,
    returnTemp: 28,
    outdoorTemp: 5,
    dhwTemp: 42,
    dhwSetpoint: 48,
    flowRate: 12,
    compressorFreq: 30,
    inverterPumpPercent: 50,
    energyWh: null,
    deltaEnergyWh: null,
    diverterValvePosition: null,
    defrostActive: false,
    rawOutdoorCycleData: null,
    rawIndoorCycleData: null,
    ...p,
  };
}

function setup(last: Partial<TelemetryRow> = {}) {
  const store = new MemoryStore();
  store.deviceList.push({
    id: "hp",
    userId: "owner",
    label: "Heat pump",
    binaryId: "SAC_EHS_MONO",
    temperatureReference: "water",
    components: ["main", "INDOOR"],
  });
  store.rows.set("hp", [row(last)]);
  const boosts = new MemoryBoostStore();
  const sent: Command[][] = [];
  let failNext = false;
  let now = t0;
  const controls = new Controls({
    store,
    boosts,
    now: () => now,
    execute: async (_id, commands) => {
      if (failNext) {
        failNext = false;
        throw new Error("SmartThings POST: 500");
      }
      sent.push(commands);
      return null;
    },
  });
  return {
    controls,
    boosts,
    sent,
    failOnce: () => {
      failNext = true;
    },
    at: (min: number) => {
      now = new Date(t0.getTime() + min * 60_000);
    },
  };
}

describe("command building", () => {
  it("addresses the first role component the device has", () => {
    expect(componentFor("heating", ["main", "INDOOR"])).toBe("INDOOR");
    expect(componentFor("heating", ["main", "INDOOR1"])).toBe("INDOOR1");
    expect(componentFor("dhw", ["main", "INDOOR"])).toBe("main");
  });

  it("sends mode and setpoint before switching on", () => {
    expect(circuitCommands("INDOOR", { on: true, setpoint: 35, mode: "heat" })).toEqual([
      {
        component: "INDOOR",
        capability: "airConditionerMode",
        command: "setAirConditionerMode",
        arguments: ["heat"],
      },
      {
        component: "INDOOR",
        capability: "thermostatCoolingSetpoint",
        command: "setCoolingSetpoint",
        arguments: [35],
      },
      { component: "INDOOR", capability: "switch", command: "on" },
    ]);
  });

  it("takes setpoint limits from FSV when known", () => {
    expect(setpointRanges({ "1051": 55, "1052": 35 }, "water").dhw).toEqual({ min: 35, max: 55 });
    expect(setpointRanges(null, "air").heating).toEqual({ min: 16, max: 30 });
    expect(checkSetpoint(47.3, { min: 30, max: 55 })).toBe(47.5);
    expect(checkSetpoint(60, { min: 30, max: 55 })).toBeNull();
  });
});

describe("Controls", () => {
  it("switches heating on the heating component", async () => {
    const { controls, sent } = setup();
    await controls.heating("hp", { on: false });
    expect(sent).toEqual([[{ component: "INDOOR", capability: "switch", command: "off" }]]);
  });

  it("rejects setpoints outside the unit's range and empty requests", async () => {
    const { controls, sent } = setup();
    await expect(controls.dhw("hp", { setpoint: 80 })).rejects.toMatchObject({
      code: "invalid_setpoint",
    });
    await expect(controls.heating("hp", {})).rejects.toMatchObject({ code: "nothing_to_do" });
    await expect(controls.heating("nope", { on: true })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(sent).toHaveLength(0);
  });

  it("skips a boost when the tank is already at target", async () => {
    const { controls } = setup({ dhwTemp: 52 });
    await expect(controls.startBoost("hp", "u", 50)).rejects.toMatchObject({
      code: "already_at_target",
    });
  });

  it("boosts, locks DHW controls, and restores setpoint and switch at target", async () => {
    const { controls, boosts, sent, at } = setup();
    const state = await controls.startBoost("hp", "u", 55, 120);
    expect(state.boost).toMatchObject({
      status: "active",
      target: 55,
      previousSetpoint: 48,
      previousOn: false,
    });
    expect(sent[0]).toEqual([
      {
        component: "main",
        capability: "thermostatCoolingSetpoint",
        command: "setCoolingSetpoint",
        arguments: [55],
      },
      { component: "main", capability: "switch", command: "on" },
    ]);
    await expect(controls.dhw("hp", { on: false })).rejects.toMatchObject({ code: "boost_active" });
    await expect(controls.startBoost("hp", "u", 55)).rejects.toMatchObject({
      code: "boost_active",
    });

    at(20);
    await controls.onPoll("hp", row({ dhwTemp: 50, dhwSetpoint: 55, dhwStatus: "on" }));
    expect(sent).toHaveLength(1);

    at(40);
    await controls.onPoll("hp", row({ dhwTemp: 55, dhwSetpoint: 55, dhwStatus: "on" }));
    expect(boosts.boosts[0]).toMatchObject({
      status: "restoring",
      reason: "target_reached",
      restoreAttempts: 1,
    });
    expect(sent[1]).toEqual([
      {
        component: "main",
        capability: "thermostatCoolingSetpoint",
        command: "setCoolingSetpoint",
        arguments: [48],
      },
      { component: "main", capability: "switch", command: "off" },
    ]);

    at(45);
    await controls.onPoll("hp", row({ dhwTemp: 55, dhwSetpoint: 48, dhwStatus: "off" }));
    expect(boosts.boosts[0]?.status).toBe("done");
    await controls.dhw("hp", { on: true });
  });

  it("ends a boost after its time and retries a restore that did not stick", async () => {
    const { controls, boosts, sent, at, failOnce } = setup({ dhwStatus: "on" });
    await controls.startBoost("hp", "u", 60, 30);

    at(31);
    failOnce();
    await controls.onPoll("hp", row({ dhwTemp: 50, dhwSetpoint: 60, dhwStatus: "on" }));
    expect(boosts.boosts[0]).toMatchObject({
      status: "restoring",
      reason: "timeout",
      restoreAttempts: 1,
    });
    expect(sent).toHaveLength(1);

    for (let i = 2; i <= 3; i++) {
      await controls.onPoll("hp", row({ dhwSetpoint: 60, dhwStatus: "on" }));
      expect(boosts.boosts[0]?.restoreAttempts).toBe(i);
    }
    // previously on: only the setpoint is restored, the switch stays as it was
    expect(sent.at(-1)).toEqual([
      {
        component: "main",
        capability: "thermostatCoolingSetpoint",
        command: "setCoolingSetpoint",
        arguments: [48],
      },
    ]);
    await controls.onPoll("hp", row({ dhwSetpoint: 60, dhwStatus: "on" }));
    expect(boosts.boosts[0]?.status).toBe("failed");
  });

  it("cancels a boost, and forgets one whose start command failed", async () => {
    const { controls, boosts, failOnce } = setup();
    failOnce();
    await expect(controls.startBoost("hp", "u", 55)).rejects.toThrow("500");
    expect(boosts.boosts).toHaveLength(0);

    await controls.startBoost("hp", "u", 55);
    const s = await controls.cancelBoost("hp");
    expect(s.boost).toMatchObject({ status: "restoring", reason: "cancelled" });
    await expect(controls.cancelBoost("hp")).rejects.toMatchObject({ code: "no_boost" });
  });
});
