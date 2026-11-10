import { describe, expect, it } from "vitest";
import type { DeviceStatus } from "../src/smartthings/types.js";
import {
  findCycleData,
  isEhsDevice,
  modeOf,
  readFsv,
  statusToTelemetry,
} from "../src/telemetry/mapping.js";
import sample from "./fixtures/st-status-ehs-mono.json" with { type: "json" };

const status = sample as unknown as DeviceStatus;
const now = new Date("2026-11-10T10:40:00Z");

function clone(): DeviceStatus {
  return structuredClone(status);
}

function set(
  s: DeviceStatus,
  component: string,
  capability: string,
  attribute: string,
  value: unknown,
) {
  const comp = s.components[component] ?? {};
  const cap = comp[capability] ?? {};
  cap[attribute] = { ...cap[attribute], value };
  comp[capability] = cap;
  s.components[component] = comp;
}

describe("statusToTelemetry", () => {
  it("maps the owner's reading to the same values dwellsee showed", () => {
    const row = statusToTelemetry(status, { now });
    expect(row).toMatchObject({
      ts: now,
      mainSystemStatus: "on",
      heatingCircuitStatus: "on",
      operatingMode: "auto",
      dhwOperatingMode: "eco",
      flowTemp: 32.2,
      flowSetpoint: 32.5,
      returnTemp: 39,
      outdoorTemp: 5,
      dhwTemp: 44.4,
      dhwSetpoint: 47,
      flowRate: 19,
      compressorFreq: 42,
      inverterPumpPercent: 100,
      energyWh: 10514547,
      deltaEnergyWh: 513,
      diverterValvePosition: "room",
      defrostActive: false,
    });
    expect(row.rawIndoorCycleData).toHaveLength(62);
    expect(row.rawOutdoorCycleData).toHaveLength(56);
    expect(row.cycleDataTs?.toISOString()).toBe("2026-11-10T10:38:39.000Z");
  });

  it("finds cycle data by payload length, whatever the attribute is called", () => {
    const s = clone();
    const hex = s.components.INDOOR?.["samsungce.ehsCycleData"]?.indoor?.value;
    delete s.components.INDOOR?.["samsungce.ehsCycleData"];
    set(s, "INDOOR", "samsungce.ehsCycleData", "blob", hex);
    expect(findCycleData(s).indoor?.hex).toBe(hex);
  });

  it("derives the energy delta from the previous row when it is missing", () => {
    const s = clone();
    const pc = s.components.main?.powerConsumptionReport?.powerConsumption;
    if (!pc) throw new Error("fixture");
    pc.value = { energy: 10514547 };
    expect(statusToTelemetry(s, { now, previousEnergyWh: 10514000 }).deltaEnergyWh).toBe(547);
    expect(statusToTelemetry(s, { now, previousEnergyWh: 10515000 }).deltaEnergyWh).toBeNull();
  });

  it("treats cycle data as stale when the whole system is off", () => {
    const s = clone();
    set(s, "main", "switch", "switch", "off");
    set(s, "INDOOR", "switch", "switch", "off");
    const row = statusToTelemetry(s, { now });
    expect(row.flowRate).toBe(0);
    expect(row.compressorFreq).toBe(0);
    expect(row.outdoorTemp).toBeNull();
    expect(modeOf(row)).toBe("off");
  });

  it("takes flow temperature from cycle data with air reference", () => {
    const s = clone();
    set(s, "main", "samsungce.ehsTemperatureReference", "temperatureReference", "air");
    const row = statusToTelemetry(s, { now });
    // 31-byte layout: byte 3 = 0x64 → 100 - 55
    expect(row.flowTemp).toBe(45);
  });

  it("returns nulls instead of throwing for an empty status", () => {
    const row = statusToTelemetry({ components: {} }, { now });
    expect(row.flowTemp).toBeNull();
    expect(row.rawIndoorCycleData).toBeNull();
    expect(modeOf(row)).toBe("idle");
  });
});

describe("helpers", () => {
  it("reads FSV values", () => {
    const fsv = readFsv(status);
    expect(fsv?.values).toEqual({
      "1031": 55,
      "1032": 25,
      "2011": -10,
      "2012": 20,
      "2021": 38,
      "2022": 27,
    });
    expect(fsv?.reportedAt?.toISOString()).toBe("2026-10-27T06:12:00.000Z");
  });

  it("recognises heat pumps by the cycle-data capability", () => {
    expect(
      isEhsDevice({
        deviceId: "a",
        components: [{ id: "main", capabilities: [{ id: "samsungce.ehsCycleData" }] }],
      }),
    ).toBe(true);
    expect(
      isEhsDevice({
        deviceId: "b",
        components: [{ id: "main", capabilities: [{ id: "switch" }] }],
      }),
    ).toBe(false);
  });

  it("classifies operating modes", () => {
    const base = {
      mainSystemStatus: "on",
      heatingCircuitStatus: "on",
      compressorFreq: 40,
      defrostActive: false,
    };
    expect(modeOf({ ...base, diverterValvePosition: "room" })).toBe("heating");
    expect(modeOf({ ...base, diverterValvePosition: "tank" })).toBe("dhw");
    expect(modeOf({ ...base, diverterValvePosition: "room", compressorFreq: 0 })).toBe("idle");
    expect(modeOf({ ...base, diverterValvePosition: "room", defrostActive: true })).toBe("defrost");
  });
});
