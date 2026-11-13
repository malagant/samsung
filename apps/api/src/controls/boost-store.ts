import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { type BoostEndReason, type BoostStatus, dhwBoosts } from "../db/schema.js";

export interface Boost {
  id: string;
  deviceId: string;
  startedBy: string | null;
  target: number;
  startedAt: Date;
  endsAt: Date;
  previousSetpoint: number | null;
  previousOn: boolean | null;
  status: BoostStatus;
  restoreAttempts: number;
  finishedAt: Date | null;
  reason: BoostEndReason | null;
}

export type NewBoost = Omit<Boost, "id" | "status" | "restoreAttempts" | "finishedAt" | "reason">;
export type BoostPatch = Partial<
  Pick<Boost, "status" | "restoreAttempts" | "finishedAt" | "reason">
>;

export interface BoostStore {
  /** The device's boost that is still active or restoring, if any. */
  current(deviceId: string): Promise<Boost | null>;
  /** The most recent boost, finished or not. */
  latest(deviceId: string): Promise<Boost | null>;
  create(b: NewBoost): Promise<Boost>;
  update(id: string, patch: BoostPatch): Promise<void>;
  remove(id: string): Promise<void>;
}

export class DrizzleBoostStore implements BoostStore {
  constructor(private readonly db: Db) {}

  async current(deviceId: string) {
    const [b] = await this.db
      .select()
      .from(dhwBoosts)
      .where(
        and(eq(dhwBoosts.deviceId, deviceId), inArray(dhwBoosts.status, ["active", "restoring"])),
      )
      .orderBy(desc(dhwBoosts.startedAt))
      .limit(1);
    return b ?? null;
  }

  async latest(deviceId: string) {
    const [b] = await this.db
      .select()
      .from(dhwBoosts)
      .where(eq(dhwBoosts.deviceId, deviceId))
      .orderBy(desc(dhwBoosts.startedAt))
      .limit(1);
    return b ?? null;
  }

  async create(b: NewBoost) {
    const [row] = await this.db
      .insert(dhwBoosts)
      .values({ ...b, status: "active" })
      .returning();
    if (!row) throw new Error("boost insert failed");
    return row;
  }

  async update(id: string, patch: BoostPatch) {
    await this.db.update(dhwBoosts).set(patch).where(eq(dhwBoosts.id, id));
  }

  async remove(id: string) {
    await this.db.delete(dhwBoosts).where(eq(dhwBoosts.id, id));
  }
}
