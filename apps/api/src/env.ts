import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  API_PORT: z.coerce.number().int().default(8787),
  API_PUBLIC_URL: z.url(),
  WEB_PUBLIC_URL: z.url(),
  CORS_ORIGINS: z.string().default(""),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  SMARTTHINGS_API_URL: z.url().default("https://api.smartthings.com/v1"),
  SMARTTHINGS_AUTH_URL: z.url().default("https://api.smartthings.com/oauth/authorize"),
  SMARTTHINGS_TOKEN_URL: z.url().default("https://auth-global.api.smartthings.com/oauth/token"),
  SMARTTHINGS_CLIENT_ID: z.string().default(""),
  SMARTTHINGS_CLIENT_SECRET: z.string().default(""),
  SMARTTHINGS_REDIRECT_URI: z.url(),
  SMARTTHINGS_SCOPES: z.string().default("r:devices:* x:devices:* r:locations:*"),
  SMARTTHINGS_MONTHLY_CALL_BUDGET: z.coerce.number().int().positive().default(100_000),
  SMARTTHINGS_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
