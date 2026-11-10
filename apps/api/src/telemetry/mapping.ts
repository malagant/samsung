import {
  applySystemOff,
  decodeIndoor,
  decodeOutdoor,
  type IndoorCycleData,
  type OutdoorCycleData,
  type TemperatureReference,
} from "@samsung/ehs-decoder";
import type { DeviceStatus, DeviceSummary } from "../smartthings/types.js";

/**
 * Converts a SmartThings device status into one telemetry row.
 *
 * Samsung spreads an EHS unit over several components. Which component holds
 * what differs between models and firmware, so every value is looked up in an
 * ordered list of candidate components and the first one that reports it wins.
 */

export const CYCLE_CAP = "samsungce.ehsCycleData";

export interface ComponentRoles {
  /** Main system switch, energy meter, temperature reference. */
  system: string[];
  /** Space heating circuit (zone 1). */
  heating: string[];
  /** Domestic hot water tank. */
  dhw: string[];
}

export const DEFAULT_ROLES: ComponentRoles = {
  system: ["main"],
  heating: ["INDOOR", "INDOOR1", "main"],
  dhw: ["main", "INDOOR2"],
};

export interface TelemetryRow {
  ts: Date;
  cycleDataTs: Date | null;
  mainSystemStatus: string | null;
  heatingCircuitStatus: string | null;
  operatingMode: string | null;
  dhwOperatingMode: string | null;
  flowTemp: number | null;
  flowSetpoint: number | null;
  returnTemp: number | null;
  outdoorTemp: number | null;
  dhwTemp: number | null;
  dhwSetpoint: number | null;
  flowRate: number | null;
  compressorFreq: number | null;
  inverterPumpPercent: number | null;
  energyWh: number | null;
  deltaEnergyWh: number | null;
  diverterValvePosition: string | null;
  defrostActive: boolean | null;
  rawOutdoorCycleData: string | null;
  rawIndoorCycleData: string | null;
}

export interface FsvReading {
  reportedAt: Date | null;
  values: Record<string, number>;
}

class StatusReader {
  constructor(private readonly s: DeviceStatus) {}

  get(components: string[], capability: string, attribute: string) {
    for (const c of components) {
      const a = this.s.components[c]?.[capability]?.[attribute];
      if (a && a.value !== null && a.value !== undefined) return a;
    }
    return undefined;
  }
  num(components: string[], capability: string, attribute: string): number | null {
    const v = this.get(components, capability, attribute)?.value;
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  str(components: string[], capability: string, attribute: string): string | null {
    const v = this.get(components, capability, attribute)?.value;
    return typeof v === "string" ? v : null;
  }
  /** First attribute on any component of a capability, regardless of name. */
  anyOf(
    capability: string,
  ): Array<{ component: string; attribute: string; value: unknown; timestamp?: string }> {
    const out = [];
    for (const [component, caps] of Object.entries(this.s.components)) {
      for (const [attribute, a] of Object.entries(caps[capability] ?? {})) {
        out.push({
          component,
          attribute,
          value: a.value,
          ...(a.timestamp ? { timestamp: a.timestamp } : {}),
        });
      }
    }
    return out;
  }
}

/** True when a device from GET /devices is a Samsung EHS heat pump. */
export function isEhsDevice(d: DeviceSummary): boolean {
  return (d.components ?? []).some((c) =>
    (c.capabilities ?? []).some((cap) => cap.id === CYCLE_CAP),
  );
}

const HEX = /^[0-9a-f]+$/i;

/** Finds the indoor and outdoor cycle-data blobs by payload length. */
export function findCycleData(status: DeviceStatus) {
  let outdoor: { hex: string; ts: string | undefined } | null = null;
  let indoor: { hex: string; ts: string | undefined } | null = null;
  for (const a of new StatusReader(status).anyOf(CYCLE_CAP)) {
    if (typeof a.value !== "string" || !HEX.test(a.value)) continue;
    const bytes = a.value.length / 2;
    if ((bytes === 18 || bytes === 28) && !outdoor) outdoor = { hex: a.value, ts: a.timestamp };
    else if ((bytes === 24 || bytes === 31 || bytes === 36) && !indoor)
      indoor = { hex: a.value, ts: a.timestamp };
  }
  return { outdoor, indoor };
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface MapOptions {
  now: Date;
  roles?: ComponentRoles;
  /** Previous row's cumulative energy, to derive the delta when SmartThings omits it. */
  previousEnergyWh?: number | null;
}

export function statusToTelemetry(status: DeviceStatus, opts: MapOptions): TelemetryRow {
  const r = new StatusReader(status);
  const roles = opts.roles ?? DEFAULT_ROLES;

  const reference = (r.str(
    roles.system.concat(roles.heating),
    "samsungce.ehsTemperatureReference",
    "temperatureReference",
  ) ?? "water") as TemperatureReference;

  const cycle = findCycleData(status);
  const outdoor: OutdoorCycleData | null = cycle.outdoor ? decodeOutdoor(cycle.outdoor.hex) : null;
  let indoor: (IndoorCycleData & { stale?: boolean }) | null = cycle.indoor
    ? decodeIndoor(cycle.indoor.hex, { temperatureReference: reference })
    : null;

  const mainSystemStatus = r.str(roles.system, "switch", "switch");
  const heatingCircuitStatus = r.str(roles.heating, "switch", "switch");
  if (indoor) {
    indoor = applySystemOff(indoor, {
      mainOn: mainSystemStatus === "on",
      heatingOn: heatingCircuitStatus === "on",
    });
  }

  // With water reference the heating component's temperature is the flow temperature,
  // with air reference it is the room temperature and flow comes from cycle data.
  const measured = r.num(roles.heating, "temperatureMeasurement", "temperature");
  const flowTemp =
    reference === "water" ? (measured ?? indoor?.flowTempC ?? null) : (indoor?.flowTempC ?? null);

  // Energy: powerConsumptionReport carries cumulative Wh and the delta since the last report.
  const report = r.get(roles.system, "powerConsumptionReport", "powerConsumption")?.value as
    | { energy?: number; deltaEnergy?: number }
    | undefined;
  const energyWh = typeof report?.energy === "number" ? report.energy : null;
  let deltaEnergyWh = typeof report?.deltaEnergy === "number" ? report.deltaEnergy : null;
  if (deltaEnergyWh === null && energyWh !== null && opts.previousEnergyWh != null) {
    const d = energyWh - opts.previousEnergyWh;
    deltaEnergyWh = d >= 0 ? d : null;
  }

  const valve =
    r.str(roles.system.concat(roles.heating), "samsungce.ehsDiverterValve", "position") ??
    r.str(roles.system.concat(roles.heating), "samsungce.ehsDiverterValve", "diverterValve");
  const defrost =
    r.str(roles.system.concat(roles.heating), "samsungce.ehsDefrostMode", "status") ??
    r.str(roles.system.concat(roles.heating), "samsungce.ehsDefrostMode", "defrostMode");

  const cycleTs = parseDate(cycle.indoor?.ts ?? cycle.outdoor?.ts);
  const outdoorStale = indoor?.stale === true;

  return {
    ts: opts.now,
    cycleDataTs: cycleTs,
    mainSystemStatus,
    heatingCircuitStatus,
    operatingMode: r.str(roles.heating, "airConditionerMode", "airConditionerMode"),
    dhwOperatingMode: r.str(roles.dhw, "airConditionerMode", "airConditionerMode"),
    flowTemp,
    flowSetpoint: r.num(roles.heating, "thermostatCoolingSetpoint", "coolingSetpoint"),
    returnTemp: indoor?.returnTempC ?? null,
    outdoorTemp: outdoorStale ? null : (outdoor?.outdoorTempC ?? null),
    dhwTemp:
      r.num(roles.dhw, "temperatureMeasurement", "temperature") ?? indoor?.dhwTankTempC ?? null,
    dhwSetpoint: r.num(roles.dhw, "thermostatCoolingSetpoint", "coolingSetpoint"),
    flowRate: indoor?.flowRateLpm ?? null,
    compressorFreq: outdoorStale ? 0 : (outdoor?.compressorFreqHz ?? null),
    inverterPumpPercent: indoor?.pumpSpeedPercent ?? null,
    energyWh,
    deltaEnergyWh,
    diverterValvePosition: valve,
    defrostActive:
      defrost === null ? null : defrost === "on" || defrost === "active" || defrost === "true",
    rawOutdoorCycleData: cycle.outdoor?.hex ?? null,
    rawIndoorCycleData: cycle.indoor?.hex ?? null,
  };
}

/** Reads the FSV values SmartThings exposes (about 20 of them). */
export function readFsv(status: DeviceStatus): FsvReading | null {
  const found = new StatusReader(status)
    .anyOf("samsungce.ehsFsvSettings")
    .find((a) => Array.isArray(a.value));
  if (!found) return null;
  const values: Record<string, number> = {};
  for (const item of found.value as Array<{ id?: unknown; value?: unknown }>) {
    const id = item.id === undefined ? null : String(item.id);
    const v = typeof item.value === "string" ? Number(item.value) : item.value;
    if (id && typeof v === "number" && Number.isFinite(v)) values[id] = v;
  }
  return { reportedAt: parseDate(found.timestamp), values };
}

/** Operating state derived from one row, used for the mode timeline. */
export type ModeState = "heating" | "dhw" | "defrost" | "idle" | "off";

export function modeOf(
  row: Pick<
    TelemetryRow,
    | "mainSystemStatus"
    | "heatingCircuitStatus"
    | "compressorFreq"
    | "diverterValvePosition"
    | "defrostActive"
  >,
): ModeState {
  if (row.mainSystemStatus === "off" && row.heatingCircuitStatus === "off") return "off";
  if (row.defrostActive) return "defrost";
  if (!row.compressorFreq || row.compressorFreq <= 0) return "idle";
  const v = row.diverterValvePosition?.toLowerCase() ?? "";
  if (v.includes("tank") || v.includes("dhw")) return "dhw";
  return "heating";
}
