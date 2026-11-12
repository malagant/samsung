// In production the web container proxies /api to the API service (see nginx.conf).
export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

/** A failed API call; `code` is the API's `error` field when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(
      res.status,
      body?.error ?? null,
      `${init?.method ?? "GET"} ${path}: ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

/** JSON request for state changes (the API refuses other content types). */
export function send<T>(method: "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  return api<T>(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
