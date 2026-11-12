import { randomUUID } from "node:crypto";
import type { Boost, BoostPatch, BoostStore, NewBoost } from "../src/controls/boost-store.js";

export class MemoryBoostStore implements BoostStore {
  boosts: Boost[] = [];
  async current(deviceId: string) {
    return (
      this.boosts.findLast(
        (b) => b.deviceId === deviceId && (b.status === "active" || b.status === "restoring"),
      ) ?? null
    );
  }
  async latest(deviceId: string) {
    return this.boosts.findLast((b) => b.deviceId === deviceId) ?? null;
  }
  async create(b: NewBoost) {
    const row: Boost = {
      ...b,
      id: randomUUID(),
      status: "active",
      restoreAttempts: 0,
      finishedAt: null,
      reason: null,
    };
    this.boosts.push(row);
    return row;
  }
  async update(id: string, patch: BoostPatch) {
    const b = this.boosts.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  }
  async remove(id: string) {
    this.boosts = this.boosts.filter((b) => b.id !== id);
  }
}
