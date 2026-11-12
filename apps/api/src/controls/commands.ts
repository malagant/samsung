import type { Command } from "../smartthings/client.js";
import { type ComponentRoles, DEFAULT_ROLES } from "../telemetry/mapping.js";

export const HEATING_MODES = ["heat", "cool", "auto"] as const;
export const DHW_MODES = ["eco", "std", "power", "force"] as const;
export type HeatingMode = (typeof HEATING_MODES)[number];
export type DhwMode = (typeof DHW_MODES)[number];

export interface CircuitInput<M extends string> {
  on?: boolean;
  mode?: M;
  setpoint?: number;
}

export interface Range {
  min: number;
  max: number;
}

/**
 * The component a command goes to: the first candidate of the role that the
 * device has. Reading uses the same candidate lists, so what the dashboard shows
 * and what a command changes stay on the same component.
 */
export function componentFor(
  role: keyof ComponentRoles,
  deviceComponents: string[],
  roles: ComponentRoles = DEFAULT_ROLES,
): string {
  const candidates = roles[role];
  return candidates.find((c) => deviceComponents.includes(c)) ?? candidates[0] ?? "main";
}

export function circuitCommands<M extends string>(
  component: string,
  input: CircuitInput<M>,
): Command[] {
  const out: Command[] = [];
  // Mode and setpoint first: switching on last avoids a burst at the old target.
  if (input.mode !== undefined) {
    out.push({
      component,
      capability: "airConditionerMode",
      command: "setAirConditionerMode",
      arguments: [input.mode],
    });
  }
  if (input.setpoint !== undefined) {
    out.push({
      component,
      capability: "thermostatCoolingSetpoint",
      command: "setCoolingSetpoint",
      arguments: [input.setpoint],
    });
  }
  if (input.on !== undefined) {
    out.push({ component, capability: "switch", command: input.on ? "on" : "off" });
  }
  return out;
}

/**
 * Allowed setpoints. The unit's own limits live in FSV settings when SmartThings
 * reports them: 1031/1032 heating water max/min, 1051/1052 DHW max/min.
 */
export function setpointRanges(
  fsv: Record<string, number> | null,
  temperatureReference: string | null,
): { heating: Range; dhw: Range } {
  const f = (id: string, fallback: number) => {
    const v = fsv?.[id];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const heating =
    temperatureReference === "air"
      ? { min: 16, max: 30 }
      : { min: f("1032", 25), max: f("1031", 55) };
  return { heating, dhw: { min: f("1052", 30), max: f("1051", 65) } };
}

/** Rounds to the 0.5 °C steps the controller accepts and checks the range. */
export function checkSetpoint(value: number, range: Range): number | null {
  const v = Math.round(value * 2) / 2;
  return v >= range.min && v <= range.max ? v : null;
}
