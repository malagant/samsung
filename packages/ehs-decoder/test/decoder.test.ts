import { describe, expect, it } from "vitest";
import {
  applySystemOff,
  decodeIndoor,
  decodeOutdoor,
  hexToBytes,
  thermalOutputKw,
} from "../src/index.js";
import sample from "./fixtures/sac-ehs-mono-sample.json" with { type: "json" };

describe("hexToBytes", () => {
  it("parses with whitespace and rejects garbage", () => {
    expect(Array.from(hexToBytes("00 1E ff") ?? [])).toEqual([0, 30, 255]);
    expect(hexToBytes("abc")).toBeNull();
    expect(hexToBytes("zz")).toBeNull();
  });
});

describe("decodeOutdoor", () => {
  it("decodes the 18-byte example", () => {
    const o = decodeOutdoor("00 1E 00 1E 5E 75 3B FF 3E 02 00 F1 01 C2 00 01 00 00");
    expect(o).toMatchObject({
      layout: "outdoor18",
      compressorFreqHz: 30,
      compressorTargetFreqHz: 30,
      dischargeTempC: 62,
      outdoorTempC: 7,
      suctionTempC: null,
    });
  });

  it("decodes the 28-byte example", () => {
    const o = decodeOutdoor(
      "00 32 00 32 5E 59 3A 3A 3C 02 02 65 01 F4 00 02 00 00 00 27 00 58 32 5F 00 00 00 00",
    );
    expect(o).toMatchObject({
      layout: "outdoor28",
      compressorFreqHz: 50,
      dischargeTempC: 34,
      evapSaturationTempC: 3,
      suctionTempC: 3,
      outdoorTempC: 5,
    });
  });

  it("maps 0xFF discharge to null", () => {
    const o = decodeOutdoor("001E001E5EFF3BFF3E020000F101C2000100");
    expect(o?.dischargeTempC).toBeNull();
  });

  it("rejects unknown lengths", () => {
    expect(decodeOutdoor("0011")).toBeNull();
  });
});

describe("decodeIndoor", () => {
  it("decodes the 24-byte example (water reference)", () => {
    const i = decodeIndoor(
      "56 58 54 05 56 05 00 22 42 00 00 00 00 00 00 00 00 01 00 00 00 0B 14 21",
    );
    expect(i).toMatchObject({
      layout: "indoor24",
      evaporatorInTempC: 31,
      evaporatorOutTempC: 33,
      returnTempC: 29,
      flowTempC: null,
      flowRateLpm: 34,
      pumpSpeedPercent: 66,
    });
  });

  it("uses byte 4 as flow temp on air-reference 24-byte devices", () => {
    const i = decodeIndoor(
      "56 58 54 05 5A 05 00 22 42 00 00 00 00 00 00 00 00 01 00 00 00 0B 14 21",
      {
        temperatureReference: "air",
      },
    );
    expect(i?.flowTempC).toBe(35);
  });

  it("decodes the 31-byte example", () => {
    const i = decodeIndoor(
      "4E 05 4E 50 05 05 00 D2 64 00 00 00 00 00 00 00 00 01 00 00 00 01 B3 B3 00 00 00 6F 05 05 4B",
    );
    expect(i).toMatchObject({
      layout: "indoor31",
      returnTempC: 23,
      flowTempC: 25,
      flowRateLpm: 21,
      pumpSpeedPercent: 100,
      dhwTankTempC: 56,
    });
  });

  it("reads flow as a 16-bit value (does not wrap above 25.5 L/min)", () => {
    const base = "4E054E500505 0136 64 000000000000000001000000 01B3B3000000 6F05054B";
    expect(decodeIndoor(base)?.flowRateLpm).toBe(31);
  });

  it("discards corrupt flow repeats above 60 L/min", () => {
    for (const raw of ["2AF8", "ADB0", "8000"]) {
      const hex = `4E054E500505${raw}64000000000000000001000000 01B3B30000006F05054B`;
      expect(decodeIndoor(hex)?.flowRateLpm).toBeNull();
    }
  });

  it("accepts the 36-byte layout", () => {
    const hex = "4E054E500505009F64000000000000000001000000 01B3B30000006F05054B 0000000000";
    const i = decodeIndoor(hex);
    expect(i).toMatchObject({ layout: "indoor36", flowRateLpm: 15.9, dhwTankTempC: null });
  });
});

describe("real SAC_EHS_MONO sample (2026-11-10)", () => {
  it("matches the values dwellsee reported for the same sample", () => {
    const outdoor = decodeOutdoor(sample.rawOutdoorCycleData);
    const indoor = decodeIndoor(sample.rawIndoorCycleData, {
      temperatureReference: sample.temperatureReference as "water",
    });
    expect(outdoor?.layout).toBe("outdoor28");
    expect(outdoor?.compressorFreqHz).toBe(sample.compressorFreq);
    expect(outdoor?.outdoorTempC).toBe(sample.outdoorTemp);
    expect(indoor?.layout).toBe("indoor31");
    expect(indoor?.returnTempC).toBe(sample.returnTemp);
    expect(indoor?.flowRateLpm).toBe(sample.flowRate);
    expect(indoor?.pumpSpeedPercent).toBe(sample.inverterPumpPercent);
  });
});

describe("applySystemOff", () => {
  it("forces flow to 0 when main and heating are off", () => {
    const i = decodeIndoor("4E054E50050500D264000000000000000001000000 01B3B30000006F05054B");
    if (!i) throw new Error("decode failed");
    expect(applySystemOff(i, { mainOn: false, heatingOn: false })).toMatchObject({
      flowRateLpm: 0,
      stale: true,
    });
    expect(applySystemOff(i, { mainOn: true, heatingOn: true }).stale).toBe(false);
  });
});

describe("thermalOutputKw", () => {
  it("computes kW from flow and ΔT", () => {
    expect(thermalOutputKw(20, 35, 30)).toBeCloseTo(6.977, 2);
    expect(thermalOutputKw(20, 30, 32)).toBe(0);
    expect(thermalOutputKw(null, 35, 30)).toBeNull();
  });
});
