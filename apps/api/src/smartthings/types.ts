/** Shape of GET /devices/{id}/status. */
export type AttributeState = { value: unknown; unit?: string; timestamp?: string };
export type ComponentStatus = Record<string, Record<string, AttributeState>>;
export interface DeviceStatus {
  components: Record<string, ComponentStatus>;
}

/** Item of GET /devices. */
export interface DeviceSummary {
  deviceId: string;
  label?: string;
  name?: string;
  manufacturerName?: string;
  ocf?: { manufacturerName?: string; modelNumber?: string };
  components?: Array<{ id: string; capabilities?: Array<{ id: string }> }>;
}

/** Device event as delivered by webhook subscriptions. */
export interface DeviceEvent {
  deviceEvent?: {
    deviceId?: string;
    componentId?: string;
    capability?: string;
    attribute?: string;
  };
}
