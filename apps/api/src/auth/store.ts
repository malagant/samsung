export type Role = "owner" | "family";

export interface User {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
}

export interface AuthStore {
  /** True while no owner with a usable password exists. */
  setupRequired(): Promise<boolean>;
  /** Creates the owner, or completes the placeholder owner created when SmartThings was linked first. */
  setupOwner(email: string, passwordHash: string, displayName: string | null): Promise<User>;
  findByEmail(email: string): Promise<(User & { passwordHash: string }) | null>;
  findById(id: string): Promise<(User & { passwordHash: string }) | null>;
  setPassword(userId: string, passwordHash: string): Promise<void>;

  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** The user behind a session that has not expired. */
  sessionUser(tokenHash: string, now: Date): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsOf(userId: string): Promise<void>;

  family(ownerId: string): Promise<User[]>;
  addFamily(
    ownerId: string,
    email: string,
    passwordHash: string,
    displayName: string | null,
  ): Promise<User>;
  removeFamily(ownerId: string, userId: string): Promise<boolean>;
}

/** Marks an owner row created before anyone set a password. */
export const UNUSABLE_PASSWORD = "!";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
