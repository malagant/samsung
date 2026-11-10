import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

/** Mirrors apps/api telemetry rows (dates arrive as ISO strings). */
export interface TelemetryRow {
  ts: string;
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
}

export type ModeState = "heating" | "dhw" | "defrost" | "idle" | "off";

export interface WindowSummary {
  from: string;
  to: string;
  samples: number;
  energyWh: number | null;
  outdoorMin: number | null;
  outdoorMax: number | null;
  minutes: Record<ModeState, number>;
  segments: Array<{ mode: ModeState; from: string; to: string }>;
}

export interface Device {
  id: string;
  label: string;
  binaryId: string | null;
  temperatureReference: string | null;
}

const REFRESH_MS = 60_000;

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => api<Device[]>("/devices"),
    retry: false,
  });
}

export function useLatest(deviceId: string | undefined) {
  return useQuery({
    queryKey: ["latest", deviceId],
    queryFn: () => api<TelemetryRow>(`/devices/${encodeURIComponent(deviceId ?? "")}/latest`),
    enabled: Boolean(deviceId),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
}

export function useWindow(deviceId: string | undefined, hours: number) {
  return useQuery({
    queryKey: ["telemetry", deviceId, hours],
    queryFn: () =>
      api<{ summary: WindowSummary; rows: TelemetryRow[] }>(
        `/devices/${encodeURIComponent(deviceId ?? "")}/telemetry?hours=${hours}`,
      ),
    enabled: Boolean(deviceId),
    refetchInterval: REFRESH_MS,
    retry: false,
  });
}

export function useFsv(deviceId: string | undefined) {
  return useQuery({
    queryKey: ["fsv", deviceId],
    queryFn: () =>
      api<{ reportedAt: string; values: Record<string, number> }>(
        `/devices/${encodeURIComponent(deviceId ?? "")}/fsv`,
      ),
    enabled: Boolean(deviceId),
    retry: false,
    staleTime: 10 * 60_000,
  });
}
