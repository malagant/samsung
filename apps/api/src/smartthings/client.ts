import type { DeviceStatus, DeviceSummary } from "./types.js";

/** Minimal SmartThings REST client. Every request counts against the monthly budget. */
export interface SmartThingsClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  onCall?: () => void;
  fetchImpl?: typeof fetch;
}

export interface Command {
  component?: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export class SmartThingsClient {
  constructor(private readonly opts: SmartThingsClientOptions) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.opts.getAccessToken();
    this.opts.onCall?.();
    const res = await (this.opts.fetchImpl ?? fetch)(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 429) throw new RateLimitedError(res.headers.get("retry-after"));
    if (!res.ok) throw new Error(`SmartThings ${init.method ?? "GET"} ${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  listDevices() {
    return this.request<{ items: DeviceSummary[] }>("/devices");
  }

  /** Full status of all components and capabilities: one call per poll. */
  deviceStatus(deviceId: string) {
    return this.request<DeviceStatus>(`/devices/${encodeURIComponent(deviceId)}/status`);
  }

  executeCommands(deviceId: string, commands: Command[]) {
    return this.request<{ results: Array<{ id: string; status: string }> }>(
      `/devices/${encodeURIComponent(deviceId)}/commands`,
      {
        method: "POST",
        body: JSON.stringify({
          commands: commands.map((c) => ({ component: "main", arguments: [], ...c })),
        }),
      },
    );
  }

  createSubscription(installedAppId: string, body: Record<string, unknown>) {
    return this.request(`/installedapps/${encodeURIComponent(installedAppId)}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfter: string | null) {
    super("SmartThings rate limit hit (HTTP 429)");
  }
}
