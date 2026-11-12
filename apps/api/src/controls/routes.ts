import { Hono } from "hono";
import { z } from "zod";
import type { AuthVars } from "../auth/session.js";
import { RateLimitedError } from "../smartthings/client.js";
import { NotLinkedError } from "../telemetry/poller.js";
import { DHW_MODES, HEATING_MODES } from "./commands.js";
import { ControlError, type Controls } from "./controller.js";

const circuit = <M extends readonly [string, ...string[]]>(modes: M) =>
  z
    .object({
      on: z.boolean().optional(),
      mode: z.enum(modes).optional(),
      setpoint: z.number().finite().optional(),
    })
    .strict();

const boost = z.object({
  target: z.number().finite(),
  minutes: z.number().int().min(15).max(120).optional(),
});

/** Heat pump controls; any signed-in household member may use them. */
export function controlRoutes(controls: Controls) {
  const app = new Hono<AuthVars>();

  app.onError((err, c) => {
    if (err instanceof ControlError) return c.json({ error: err.code }, err.status);
    if (err instanceof NotLinkedError) return c.json({ error: "not_linked" }, 409);
    if (err instanceof RateLimitedError) return c.json({ error: "rate_limited" }, 429);
    console.error(err);
    return c.json({ error: "smartthings_error" }, 502);
  });

  app.get("/devices/:id/controls", async (c) => c.json(await controls.state(c.req.param("id"))));

  app.post("/devices/:id/controls/heating", async (c) => {
    const body = circuit(HEATING_MODES).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    return c.json(await controls.heating(c.req.param("id"), body.data));
  });

  app.post("/devices/:id/controls/dhw", async (c) => {
    const body = circuit(DHW_MODES).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    return c.json(await controls.dhw(c.req.param("id"), body.data));
  });

  app.post("/devices/:id/boost", async (c) => {
    const body = boost.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_input" }, 400);
    const user = c.var.user?.id ?? "";
    return c.json(
      await controls.startBoost(c.req.param("id"), user, body.data.target, body.data.minutes),
      201,
    );
  });

  app.delete("/devices/:id/boost", async (c) =>
    c.json(await controls.cancelBoost(c.req.param("id"))),
  );

  return app;
}
