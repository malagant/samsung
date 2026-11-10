/**
 * Decoder for the Samsung EHS `samsungce.ehsCycleData` SmartThings capability.
 *
 * Samsung does not document this format; the layout is reverse-engineered
 * (see docs/decoding-spec.md). Layout is selected by payload length first,
 * because a 2026-03-31 firmware moved SAC_EHS_MONO/SPLIT from 24 to 31 bytes.
 */
import { hexToBytes, i16be, temp, u16be } from "./hex.js";

export { hexToBytes } from "./hex.js";

/** Flow readings above this are corrupt repeats (×10/×100, truncated to 16 bits). */
export const MAX_PLAUSIBLE_FLOW_LPM = 60;

export type TemperatureReference = "water" | "air";
export type IndoorLayout = "indoor24" | "indoor31" | "indoor36";
export type OutdoorLayout = "outdoor18" | "outdoor28";

export interface OutdoorCycleData {
  layout: OutdoorLayout;
  compressorFreqHz: number | null;
  compressorTargetFreqHz: number | null;
  dischargeTempC: number | null;
  evapSaturationTempC: number | null;
  /** Only in the 28-byte format. */
  suctionTempC: number | null;
  outdoorTempC: number | null;
}

export interface IndoorCycleData {
  layout: IndoorLayout;
  /** Only in the 24-byte format. */
  evaporatorInTempC: number | null;
  /** Only in the 24-byte format. */
  evaporatorOutTempC: number | null;
  returnTempC: number | null;
  /**
   * Flow temperature from cycle data. For the 24-byte layout this is only
   * meaningful on air-reference devices; otherwise null.
   */
  flowTempC: number | null;
  flowRateLpm: number | null;
  pumpSpeedPercent: number | null;
  /** 31-byte layout byte 27, unconfirmed. */
  dhwTankTempC: number | null;
}

export function decodeOutdoor(hex: string): OutdoorCycleData | null {
  const b = hexToBytes(hex);
  if (!b) return null;
  let layout: OutdoorLayout;
  if (b.length === 18) layout = "outdoor18";
  else if (b.length === 28) layout = "outdoor28";
  else return null;

  return {
    layout,
    compressorFreqHz: i16be(b, 0),
    compressorTargetFreqHz: i16be(b, 2),
    dischargeTempC: temp(b[5]),
    evapSaturationTempC: temp(b[6]),
    suctionTempC: layout === "outdoor28" ? temp(b[7]) : null,
    outdoorTempC: temp(b[8]),
  };
}

export interface IndoorOptions {
  temperatureReference?: TemperatureReference;
}

export function decodeIndoor(hex: string, opts: IndoorOptions = {}): IndoorCycleData | null {
  const b = hexToBytes(hex);
  if (!b) return null;
  const ref = opts.temperatureReference ?? "water";

  if (b.length === 24) {
    const flow = b[7] ?? null;
    return {
      layout: "indoor24",
      evaporatorInTempC: temp(b[0]),
      evaporatorOutTempC: temp(b[1]),
      returnTempC: temp(b[2]),
      flowTempC: ref === "air" ? temp(b[4]) : null,
      flowRateLpm: sanitizeFlow(flow),
      pumpSpeedPercent: b[8] ?? null,
      dhwTankTempC: null,
    };
  }

  if (b.length === 31 || b.length === 36) {
    const raw = u16be(b, 6);
    return {
      layout: b.length === 31 ? "indoor31" : "indoor36",
      evaporatorInTempC: null,
      evaporatorOutTempC: null,
      returnTempC: temp(b[2]),
      flowTempC: temp(b[3]),
      flowRateLpm: raw === null ? null : sanitizeFlow(raw / 10),
      pumpSpeedPercent: b[8] ?? null,
      dhwTankTempC: b.length === 31 ? temp(b[27]) : null,
    };
  }

  return null;
}

function sanitizeFlow(lpm: number | null): number | null {
  if (lpm === null || lpm < 0 || lpm > MAX_PLAUSIBLE_FLOW_LPM) return null;
  return Math.round(lpm * 10) / 10;
}

export interface SystemState {
  /** Main system switch. */
  mainOn: boolean;
  /** Space heating circuit. */
  heatingOn: boolean;
}

/**
 * Cycle data stops updating while the system is off, so the last blob is
 * stale. Apply this after decoding: forces flow to 0 and marks values stale.
 */
export function applySystemOff<T extends IndoorCycleData>(
  indoor: T,
  state: SystemState,
): T & { stale: boolean } {
  const off = !state.mainOn && !state.heatingOn;
  return off ? { ...indoor, flowRateLpm: 0, stale: true } : { ...indoor, stale: false };
}

/**
 * Estimated thermal output in kW from flow rate and ΔT.
 * Water: c ≈ 4.186 kJ/(kg·K), ρ ≈ 1 kg/L.
 */
export function thermalOutputKw(
  flowLpm: number | null,
  flowTempC: number | null,
  returnTempC: number | null,
): number | null {
  if (flowLpm === null || flowTempC === null || returnTempC === null) return null;
  const dT = flowTempC - returnTempC;
  if (flowLpm <= 0 || dT <= 0) return 0;
  return (flowLpm / 60) * 4.186 * dT;
}
