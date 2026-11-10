import { type ModeState, modeOf, type TelemetryRow } from "./mapping.js";

export interface Segment {
  mode: ModeState;
  from: string;
  to: string;
}

export interface WindowSummary {
  from: string;
  to: string;
  samples: number;
  energyWh: number | null;
  outdoorMin: number | null;
  outdoorMax: number | null;
  minutes: Record<ModeState, number>;
  segments: Segment[];
}

/** A gap longer than this between two samples is shown as unknown (not part of a segment). */
const MAX_GAP_MS = 30 * 60 * 1000;

export function summarize(rows: TelemetryRow[], from: Date, to: Date): WindowSummary {
  const minutes: Record<ModeState, number> = { heating: 0, dhw: 0, defrost: 0, idle: 0, off: 0 };
  const segments: Segment[] = [];
  let energy: number | null = null;
  let oMin: number | null = null;
  let oMax: number | null = null;

  rows.forEach((r, i) => {
    if (r.deltaEnergyWh !== null) energy = (energy ?? 0) + r.deltaEnergyWh;
    if (r.outdoorTemp !== null) {
      oMin = oMin === null ? r.outdoorTemp : Math.min(oMin, r.outdoorTemp);
      oMax = oMax === null ? r.outdoorTemp : Math.max(oMax, r.outdoorTemp);
    }
    const start = r.ts.getTime();
    const nextTs = rows[i + 1]?.ts.getTime() ?? Math.min(to.getTime(), start + MAX_GAP_MS);
    const end = Math.min(nextTs, start + MAX_GAP_MS);
    if (end <= start) return;
    const mode = modeOf(r);
    minutes[mode] += (end - start) / 60000;
    const last = segments.at(-1);
    if (last && last.mode === mode && new Date(last.to).getTime() === start)
      last.to = new Date(end).toISOString();
    else
      segments.push({ mode, from: new Date(start).toISOString(), to: new Date(end).toISOString() });
  });

  for (const k of Object.keys(minutes) as ModeState[]) minutes[k] = Math.round(minutes[k]);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    samples: rows.length,
    energyWh: energy,
    outdoorMin: oMin,
    outdoorMax: oMax,
    minutes,
    segments,
  };
}
