// In production the web container proxies /api to the API service (see nginx.conf).
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status}`);
  return (await res.json()) as T;
}
