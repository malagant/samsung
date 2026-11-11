import type { Device, ModeState, TelemetryRow, WindowSummary } from "./data.js";
import { demo } from "./demo.js";

export type TimelineKind = ModeState | "none";

export interface OverviewModel {
  live: boolean;
  model: string;
  updatedAt: Date;
  flowTemp: number | null;
  flowSetpoint: number | null;
  returnTemp: number | null;
  heatingOn: boolean;
  dhwOn: boolean;
  dhwTemp: number | null;
  dhwSetpoint: number | null;
  dhwMode: string | null;
  /** The diverter valve currently feeds the tank. */
  dhwHeating: boolean;
  outdoorTemp: number | null;
  outdoorMin: number | null;
  outdoorMax: number | null;
  energyKwh: number | null;
  compressorHz: number | null;
  flowRateLpm: number | null;
  pumpPercent: number | null;
  boostTarget: number;
  curve: { coldOutdoor: number; coldFlow: number; warmOutdoor: number; warmFlow: number } | null;
  /** Kind and duration in minutes, oldest first. */
  timeline: Array<[TimelineKind, number]>;
}

const MODEL_NAMES: Record<string, string> = {
  SAC_EHS_MONO: "Samsung EHS Mono",
  SAC_EHS_SPLIT: "Samsung EHS Split",
};

export function demoModel(): OverviewModel {
  return {
    live: false,
    model: demo.model,
    updatedAt: demo.updatedAt,
    flowTemp: demo.flowTemp,
    flowSetpoint: demo.flowSetpoint,
    returnTemp: demo.returnTemp,
    heatingOn: demo.heatingOn,
    dhwOn: demo.dhwOn,
    dhwTemp: demo.dhwTemp,
    dhwSetpoint: demo.dhwSetpoint,
    dhwMode: demo.dhwMode,
    dhwHeating: false,
    outdoorTemp: demo.outdoorTemp,
    outdoorMin: demo.outdoorMin,
    outdoorMax: demo.outdoorMax,
    energyKwh: demo.energyKwh24h,
    compressorHz: demo.compressorHz,
    flowRateLpm: demo.flowRateLpm,
    pumpPercent: demo.pumpPercent,
    boostTarget: demo.boostTarget,
    curve: demo.curve,
    timeline: demo.timeline.map(([k, w]) => [k, w * 30]),
  };
}

/** Fills the timeline with "none" where no samples exist. */
export function timelineFromSummary(s: WindowSummary): Array<[TimelineKind, number]> {
  const out: Array<[TimelineKind, number]> = [];
  let cursor = new Date(s.from).getTime();
  const min = (a: number, b: number) => Math.max(0, (b - a) / 60000);
  for (const seg of s.segments) {
    const start = new Date(seg.from).getTime();
    const end = new Date(seg.to).getTime();
    if (start > cursor + 60_000) out.push(["none", min(cursor, start)]);
    out.push([seg.mode, min(Math.max(start, cursor), end)]);
    cursor = Math.max(cursor, end);
  }
  const to = new Date(s.to).getTime();
  if (to > cursor + 60_000) out.push(["none", min(cursor, to)]);
  return out.filter(([, w]) => w > 0);
}

export function liveModel(input: {
  device: Device;
  latest: TelemetryRow;
  summary: WindowSummary | undefined;
  fsv: Record<string, number> | undefined;
}): OverviewModel {
  const { device, latest: l, summary, fsv } = input;
  const valve = l.diverterValvePosition?.toLowerCase() ?? "";
  const curve =
    fsv && ["2011", "2012", "2021", "2022"].every((k) => typeof fsv[k] === "number")
      ? {
          coldOutdoor: fsv["2011"] as number,
          warmOutdoor: fsv["2012"] as number,
          coldFlow: fsv["2021"] as number,
          warmFlow: fsv["2022"] as number,
        }
      : null;
  return {
    live: true,
    model: (device.binaryId && MODEL_NAMES[device.binaryId]) || device.label,
    updatedAt: new Date(l.ts),
    flowTemp: l.flowTemp,
    flowSetpoint: l.flowSetpoint,
    returnTemp: l.returnTemp,
    heatingOn: l.heatingCircuitStatus === "on",
    dhwOn: l.mainSystemStatus === "on",
    dhwTemp: l.dhwTemp,
    dhwSetpoint: l.dhwSetpoint,
    dhwMode: l.dhwOperatingMode,
    dhwHeating: (valve.includes("tank") || valve.includes("dhw")) && (l.compressorFreq ?? 0) > 0,
    outdoorTemp: l.outdoorTemp,
    outdoorMin: summary?.outdoorMin ?? null,
    outdoorMax: summary?.outdoorMax ?? null,
    energyKwh: summary?.energyWh == null ? null : summary.energyWh / 1000,
    compressorHz: l.compressorFreq,
    flowRateLpm: l.flowRate,
    pumpPercent: l.inverterPumpPercent,
    boostTarget: 50,
    curve,
    timeline: summary ? timelineFromSummary(summary) : [],
  };
}
