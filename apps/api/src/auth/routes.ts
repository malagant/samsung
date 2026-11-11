import { Hono } from "hono";
import { z } from "zod";
import { hashPassword, passwordProblem, verifyPassword } from "./password.js";
import { AttemptLimiter } from "./rate-limit.js";
import {
  type AuthVars,
  endSession,
  requireOwner,
  requireUser,
  type SessionOptions,
  startSession,
} from "./session.js";
import { normalizeEmail } from "./store.js";

const credentials = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(1).max(200),
});
const newAccount = credentials.extend({ displayName: z.string().trim().max(80).optional() });

/** Fixed hash so unknown e-mails cost the same time as wrong passwords. */
let dummyHash: Promise<string> | null = null;

export function authRoutes(opts: SessionOptions) {
  const app = new Hono<AuthVars>();
  const limiter = new AttemptLimiter(10, 15 * 60_000, () => opts.now().getTime());

  app.get("/auth/state", async (c) =>
    c.json({ setupRequired: await opts.store.setupRequired(), user: c.var.user }),
  );

  // First visit: the owner chooses e-mail and password. Only possible while no owner has one.
  app.post("/auth/setup", async (c) => {
    if (!(await opts.store.setupRequired())) return c.json({ error: "already_set_up" }, 409);
    const body = newAccount.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    const problem = passwordProblem(body.data.password);
    if (problem) return c.json({ error: problem }, 400);
    const user = await opts.store.setupOwner(
      body.data.email,
      await hashPassword(body.data.password),
      body.data.displayName || null,
    );
    await startSession(c, opts, user.id);
    return c.json({ user }, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = credentials.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    const key = normalizeEmail(body.data.email);
    if (!limiter.allow(key)) return c.json({ error: "too_many_attempts" }, 429);
    const found = await opts.store.findByEmail(key);
    dummyHash ??= hashPassword("not-a-real-password");
    const ok = await verifyPassword(body.data.password, found?.passwordHash ?? (await dummyHash));
    if (!found || !ok) return c.json({ error: "invalid_credentials" }, 401);
    limiter.reset(key);
    await startSession(c, opts, found.id);
    const { passwordHash: _p, ...user } = found;
    return c.json({ user });
  });

  app.post("/auth/logout", async (c) => {
    await endSession(c, opts);
    return c.json({ ok: true });
  });

  app.get("/auth/me", requireUser, (c) => c.json({ user: c.var.user }));

  app.post("/auth/password", requireUser, async (c) => {
    const body = z
      .object({ current: z.string().min(1).max(200), next: z.string().max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    const me = await opts.store.findById(c.var.user?.id ?? "");
    if (!me || !(await verifyPassword(body.data.current, me.passwordHash))) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    const problem = passwordProblem(body.data.next);
    if (problem) return c.json({ error: problem }, 400);
    await opts.store.setPassword(me.id, await hashPassword(body.data.next));
    // Sign out everywhere else, then start a fresh session here.
    await opts.store.deleteSessionsOf(me.id);
    await startSession(c, opts, me.id);
    return c.json({ ok: true });
  });

  // ── Family members (owner only) ─────────────────────────────────
  app.get("/family", requireOwner, async (c) =>
    c.json(await opts.store.family(c.var.user?.id ?? "")),
  );

  app.post("/family", requireOwner, async (c) => {
    const body = newAccount.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    const problem = passwordProblem(body.data.password);
    if (problem) return c.json({ error: problem }, 400);
    if (await opts.store.findByEmail(body.data.email)) return c.json({ error: "email_taken" }, 409);
    const user = await opts.store.addFamily(
      c.var.user?.id ?? "",
      body.data.email,
      await hashPassword(body.data.password),
      body.data.displayName || null,
    );
    return c.json(user, 201);
  });

  app.delete("/family/:id", requireOwner, async (c) => {
    const removed = await opts.store.removeFamily(c.var.user?.id ?? "", c.req.param("id"));
    return removed ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  return app;
}
