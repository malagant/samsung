import { randomUUID } from "node:crypto";
import { type AuthStore, normalizeEmail, UNUSABLE_PASSWORD, type User } from "../src/auth/store.js";

type Row = User & { passwordHash: string; ownerId: string | null };

export class MemoryAuthStore implements AuthStore {
  users: Row[] = [];
  sessions = new Map<string, { userId: string; expiresAt: Date }>();

  private strip(u: Row): User {
    return { id: u.id, email: u.email, role: u.role, displayName: u.displayName };
  }
  private full(u: Row | undefined) {
    if (!u) return null;
    const { ownerId: _o, ...rest } = u;
    return rest;
  }

  async setupRequired() {
    const owner = this.users.find((u) => u.role === "owner");
    return !owner || owner.passwordHash === UNUSABLE_PASSWORD;
  }
  async setupOwner(email: string, passwordHash: string, displayName: string | null) {
    let owner = this.users.find((u) => u.role === "owner");
    if (!owner) {
      owner = {
        id: randomUUID(),
        email: "",
        passwordHash: "",
        displayName: null,
        role: "owner",
        ownerId: null,
      };
      this.users.push(owner);
    }
    Object.assign(owner, { email: normalizeEmail(email), passwordHash, displayName });
    return this.strip(owner);
  }
  async findByEmail(email: string) {
    return this.full(this.users.find((u) => u.email === normalizeEmail(email)));
  }
  async findById(id: string) {
    return this.full(this.users.find((u) => u.id === id));
  }
  async setPassword(userId: string, passwordHash: string) {
    const u = this.users.find((x) => x.id === userId);
    if (u) u.passwordHash = passwordHash;
  }
  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async sessionUser(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expiresAt <= now) return null;
    const u = this.users.find((x) => x.id === s.userId);
    return u ? this.strip(u) : null;
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteSessionsOf(userId: string) {
    for (const [k, v] of this.sessions) if (v.userId === userId) this.sessions.delete(k);
  }
  async family(ownerId: string) {
    return this.users
      .filter((u) => u.ownerId === ownerId && u.role === "family")
      .map((u) => this.strip(u));
  }
  async addFamily(
    ownerId: string,
    email: string,
    passwordHash: string,
    displayName: string | null,
  ) {
    const u: Row = {
      id: randomUUID(),
      email: normalizeEmail(email),
      passwordHash,
      displayName,
      role: "family",
      ownerId,
    };
    this.users.push(u);
    return this.strip(u);
  }
  async removeFamily(ownerId: string, userId: string) {
    const i = this.users.findIndex(
      (u) => u.id === userId && u.ownerId === ownerId && u.role === "family",
    );
    if (i < 0) return false;
    this.users.splice(i, 1);
    await this.deleteSessionsOf(userId);
    return true;
  }
}
