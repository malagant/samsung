import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { type AuthStore, normalizeEmail, UNUSABLE_PASSWORD, type User } from "./store.js";

const cols = {
  id: users.id,
  email: users.email,
  role: users.role,
  displayName: users.displayName,
  passwordHash: users.passwordHash,
};

function strip<T extends User & { passwordHash: string }>(u: T): User {
  return { id: u.id, email: u.email, role: u.role, displayName: u.displayName };
}

export class DrizzleAuthStore implements AuthStore {
  constructor(private readonly db: Db) {}

  async setupRequired() {
    const [owner] = await this.db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.role, "owner"))
      .limit(1);
    return !owner || owner.hash === UNUSABLE_PASSWORD;
  }

  async setupOwner(email: string, passwordHash: string, displayName: string | null) {
    const values = { email: normalizeEmail(email), passwordHash, displayName };
    const [placeholder] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "owner"))
      .limit(1);
    const [u] = placeholder
      ? await this.db.update(users).set(values).where(eq(users.id, placeholder.id)).returning(cols)
      : await this.db
          .insert(users)
          .values({ ...values, role: "owner" })
          .returning(cols);
    if (!u) throw new Error("owner setup failed");
    return strip(u);
  }

  async findByEmail(email: string) {
    const [u] = await this.db
      .select(cols)
      .from(users)
      .where(eq(users.email, normalizeEmail(email)))
      .limit(1);
    return u ?? null;
  }

  async findById(id: string) {
    const [u] = await this.db.select(cols).from(users).where(eq(users.id, id)).limit(1);
    return u ?? null;
  }

  async setPassword(userId: string, passwordHash: string) {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    await this.db.insert(sessions).values({ id: tokenHash, userId, expiresAt });
  }

  async sessionUser(tokenHash: string, now: Date) {
    const [u] = await this.db
      .select(cols)
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);
    return u ? strip(u) : null;
  }

  async deleteSession(tokenHash: string) {
    await this.db.delete(sessions).where(eq(sessions.id, tokenHash));
  }

  async deleteSessionsOf(userId: string) {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async family(ownerId: string) {
    const rows = await this.db
      .select(cols)
      .from(users)
      .where(and(eq(users.ownerId, ownerId), eq(users.role, "family")));
    return rows.map(strip);
  }

  async addFamily(
    ownerId: string,
    email: string,
    passwordHash: string,
    displayName: string | null,
  ) {
    const [u] = await this.db
      .insert(users)
      .values({ email: normalizeEmail(email), passwordHash, displayName, role: "family", ownerId })
      .returning(cols);
    if (!u) throw new Error("insert failed");
    return strip(u);
  }

  async removeFamily(ownerId: string, userId: string) {
    const gone = await this.db
      .delete(users)
      .where(and(eq(users.id, userId), eq(users.ownerId, ownerId), eq(users.role, "family")))
      .returning({ id: users.id });
    return gone.length > 0;
  }
}
