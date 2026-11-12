import { describe, expect, it } from "vitest";
import type { TelemetryRow } from "../src/telemetry/mapping.js";
import { summarize } from "../src/telemetry/summary.js";

const t0 = new Date("2026-11-10T00:00:00Z").getTime();
function row(min: number, p: Partial<TelemetryRow>): TelemetryRow {
  return {
    ts: new Date(t0 + min * 60_000),
    cycleDataTs: null,
    mainSystemStatus: "on",
    heatingCircuitStatus: "on",
    dhwStatus: "on",
    operatingMode: "auto",
    dhwOperatingMode: "eco",
    flowTemp: 30,
    flowSetpoint: 30,
    returnTemp: 27,
    outdoorTemp: 5,
    dhwTemp: 45,
    dhwSetpoint: 47,
    flowRate: 19,
    compressorFreq: 40,
    inverterPumpPercent: 100,
    energyWh: null,
    deltaEnergyWh: 100,
    diverterValvePosition: "room",
    defrostActive: false,
    rawOutdoorCycleData: null,
    rawIndoorCycleData: null,
    ...p,
  };
}

describe("summarize", () => {
  it("merges samples into mode segments and sums energy", () => {
    const rows = [
      row(0, { outdoorTemp: 4 }),
      row(5, {}),
      row(10, { diverterValvePosition: "tank" }),
      row(15, { compressorFreq: 0, outdoorTemp: 6 }),
      row(20, { compressorFreq: 0, deltaEnergyWh: null }),
    ];
    const s = summarize(rows, new Date(t0), new Date(t0 + 25 * 60_000));
    expect(s.segments.map((x) => x.mode)).toEqual(["heating", "dhw", "idle"]);
    expect(s.minutes).toMatchObject({ heating: 10, dhw: 5, idle: 10 });
    expect(s.energyWh).toBe(400);
    expect(s.outdoorMin).toBe(4);
    expect(s.outdoorMax).toBe(6);
  });

  it("leaves gaps in the data as gaps", () => {
    const s = summarize([row(0, {}), row(120, {})], new Date(t0), new Date(t0 + 125 * 60_000));
    expect(s.segments).toHaveLength(2);
    expect(s.minutes.heating).toBe(35);
  });

  it("handles an empty window", () => {
    const s = summarize([], new Date(t0), new Date(t0 + 1));
    expect(s).toMatchObject({ samples: 0, energyWh: null, segments: [] });
  });
});
