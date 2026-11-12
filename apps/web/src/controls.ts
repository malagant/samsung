import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send } from "./api.js";

export interface Range {
  min: number;
  max: number;
}

export interface Boost {
  id: string;
  target: number;
  startedAt: string;
  endsAt: string;
  status: "active" | "restoring" | "done" | "failed";
  reason: "target_reached" | "timeout" | "cancelled" | null;
  finishedAt: string | null;
}

export interface ControlState {
  reportedAt: string | null;
  heating: { on: boolean | null; mode: string | null; setpoint: number | null; range: Range };
  dhw: {
    on: boolean | null;
    mode: string | null;
    setpoint: number | null;
    temperature: number | null;
    range: Range;
  };
  boost: Boost | null;
}

export const HEATING_MODES = ["heat", "cool", "auto"] as const;
export const DHW_MODES = ["eco", "std", "power", "force"] as const;

export type CircuitChange = { on?: boolean; mode?: string; setpoint?: number };

const key = (id: string | undefined) => ["controls", id] as const;

export function useControls(deviceId: string | undefined) {
  return useQuery({
    queryKey: key(deviceId),
    queryFn: () => api<ControlState>(`/devices/${encodeURIComponent(deviceId ?? "")}/controls`),
    enabled: Boolean(deviceId),
    // A running boost changes state on every poll.
    refetchInterval: (q) => (isRunning(q.state.data?.boost) ? 30_000 : 60_000),
    retry: false,
  });
}

export function isRunning(b: Boost | null | undefined) {
  return b?.status === "active" || b?.status === "restoring";
}

/** All control actions; each answers with the fresh state. */
export function useControlActions(deviceId: string | undefined) {
  const qc = useQueryClient();
  const path = `/devices/${encodeURIComponent(deviceId ?? "")}`;
  const done = (state: ControlState) => {
    qc.setQueryData(key(deviceId), state);
    void qc.invalidateQueries({ queryKey: ["latest", deviceId] });
  };
  return {
    heating: useMutation({
      mutationFn: (c: CircuitChange) => send<ControlState>("POST", `${path}/controls/heating`, c),
      onSuccess: done,
    }),
    dhw: useMutation({
      mutationFn: (c: CircuitChange) => send<ControlState>("POST", `${path}/controls/dhw`, c),
      onSuccess: done,
    }),
    startBoost: useMutation({
      mutationFn: (b: { target: number; minutes: number }) =>
        send<ControlState>("POST", `${path}/boost`, b),
      onSuccess: done,
    }),
    cancelBoost: useMutation({
      mutationFn: () => send<ControlState>("DELETE", `${path}/boost`),
      onSuccess: done,
    }),
  };
}
