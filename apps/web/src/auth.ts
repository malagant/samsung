import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, send } from "./api.js";

export interface User {
  id: string;
  email: string;
  role: "owner" | "family";
  displayName: string | null;
}

export interface AuthState {
  setupRequired: boolean;
  user: User | null;
}

export const AUTH_KEY = ["auth"] as const;

export function useAuth() {
  return useQuery({
    queryKey: AUTH_KEY,
    queryFn: () => api<AuthState>("/auth/state"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Signs in (or completes the first-run setup) and refreshes everything. */
export function useSignIn(kind: "login" | "setup") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; displayName?: string }) =>
      send<{ user: User }>("POST", `/auth/${kind}`, body),
    onSuccess: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== AUTH_KEY[0] });
      await qc.invalidateQueries({ queryKey: AUTH_KEY });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => send("POST", "/auth/logout", {}),
    onSettled: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== AUTH_KEY[0] });
      await qc.invalidateQueries({ queryKey: AUTH_KEY });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current: string; next: string }) => send("POST", "/auth/password", body),
  });
}

export function useFamily(enabled: boolean) {
  return useQuery({ queryKey: ["family"], queryFn: () => api<User[]>("/family"), enabled });
}

export function useAddFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; displayName?: string }) =>
      send<User>("POST", "/family", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["family"] }),
  });
}

export function useRemoveFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send("DELETE", `/family/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["family"] }),
  });
}

export interface SmartThingsStatus {
  linked: boolean;
  pollingStatus: string | null;
  lastSuccessfulPoll: string | null;
  callsThisMonth: number;
  monthlyBudget: number;
}

export function useSmartThingsStatus() {
  return useQuery({
    queryKey: ["smartthings-status"],
    queryFn: () => api<SmartThingsStatus>("/smartthings/status"),
    retry: false,
  });
}
