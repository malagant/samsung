import { createHash, randomBytes } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AuthStore, User } from "./store.js";

export const SESSION_COOKIE = "session";
export const SESSION_DAYS = 30;

export type AuthVars = { Variables: { user: User | null } };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export interface SessionOptions {
  store: AuthStore;
  /** Send the cookie only over HTTPS. */
  secure: boolean;
  now: () => Date;
}

export async function startSession(c: Context, opts: SessionOptions, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(opts.now().getTime() + SESSION_DAYS * 86400_000);
  await opts.store.createSession(hashToken(token), userId, expiresAt);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(c: Context, opts: SessionOptions) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await opts.store.deleteSession(hashToken(token));
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: opts.secure });
}

/** Resolves the session cookie into `c.var.user` (null when absent or expired). */
export function loadUser(opts: SessionOptions): MiddlewareHandler<AuthVars> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    c.set("user", token ? await opts.store.sessionUser(hashToken(token), opts.now()) : null);
    await next();
  };
}

export const requireUser: MiddlewareHandler<AuthVars> = async (c, next) => {
  if (!c.var.user) return c.json({ error: "unauthorized" }, 401);
  await next();
};

export const requireOwner: MiddlewareHandler<AuthVars> = async (c, next) => {
  if (!c.var.user) return c.json({ error: "unauthorized" }, 401);
  if (c.var.user.role !== "owner") return c.json({ error: "forbidden" }, 403);
  await next();
};

/**
 * State-changing requests must be JSON. Browsers cannot send a cross-site
 * JSON POST without a CORS preflight, which together with SameSite=Lax
 * cookies keeps other sites from acting on a logged-in session.
 */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  // DELETE/PUT/PATCH already force a preflight; POST is the one "simple" method.
  if (c.req.method === "POST" || c.req.method === "PUT" || c.req.method === "PATCH") {
    const type = c.req.header("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
  }
  await next();
};
