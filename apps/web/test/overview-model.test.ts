import { describe, expect, it } from "vitest";
import type { TelemetryRow, WindowSummary } from "../src/data.js";
import { liveModel, timelineFromSummary } from "../src/overview-model.js";

const summary: WindowSummary = {
  from: "2026-11-10T00:00:00Z",
  to: "2026-11-10T06:00:00Z",
  samples: 3,
  energyWh: 1600,
  outdoorMin: 4,
  outdoorMax: 5,
  minutes: { heating: 60, dhw: 30, defrost: 0, idle: 0, off: 0 },
  segments: [
    { mode: "heating", from: "2026-11-10T02:00:00Z", to: "2026-11-10T03:00:00Z" },
    { mode: "dhw", from: "2026-11-10T03:00:00Z", to: "2026-11-10T03:30:00Z" },
  ],
};

const latest: TelemetryRow = {
  ts: "2026-11-10T05:55:00Z",
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
};

describe("overview model", () => {
  it("pads the timeline with no-data stretches", () => {
    expect(timelineFromSummary(summary)).toEqual([
      ["none", 120],
      ["heating", 60],
      ["dhw", 30],
      ["none", 150],
    ]);
  });

  it("builds the live model, including the curve from FSVs", () => {
    const m = liveModel({
      device: {
        id: "hp",
        label: "Wärmepumpe",
        binaryId: "SAC_EHS_MONO",
        temperatureReference: "water",
      },
      latest,
      summary,
      fsv: { "2011": -10, "2012": 20, "2021": 38, "2022": 27 },
    });
    expect(m).toMatchObject({
      live: true,
      model: "Samsung EHS Mono",
      energyKwh: 1.6,
      heatingOn: true,
      dhwHeating: false,
    });
    expect(m.curve).toEqual({ coldOutdoor: -10, warmOutdoor: 20, coldFlow: 38, warmFlow: 27 });
  });

  it("has no curve while FSVs are missing", () => {
    const m = liveModel({
      device: { id: "hp", label: "HP", binaryId: null, temperatureReference: null },
      latest,
      summary: undefined,
      fsv: undefined,
    });
    expect(m.curve).toBeNull();
    expect(m.model).toBe("HP");
    expect(m.timeline).toEqual([]);
  });
});
