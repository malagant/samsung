import type { Env } from "../env.js";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  installedAppId?: string;
}

type OAuthEnv = Pick<
  Env,
  | "SMARTTHINGS_AUTH_URL"
  | "SMARTTHINGS_TOKEN_URL"
  | "SMARTTHINGS_CLIENT_ID"
  | "SMARTTHINGS_CLIENT_SECRET"
  | "SMARTTHINGS_REDIRECT_URI"
  | "SMARTTHINGS_SCOPES"
>;

export function authorizeUrl(env: OAuthEnv, state: string): string {
  const u = new URL(env.SMARTTHINGS_AUTH_URL);
  u.searchParams.set("client_id", env.SMARTTHINGS_CLIENT_ID);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", env.SMARTTHINGS_REDIRECT_URI);
  u.searchParams.set("scope", env.SMARTTHINGS_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(
  env: OAuthEnv,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenSet> {
  const basic = Buffer.from(
    `${env.SMARTTHINGS_CLIENT_ID}:${env.SMARTTHINGS_CLIENT_SECRET}`,
  ).toString("base64");
  const res = await fetchImpl(env.SMARTTHINGS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ client_id: env.SMARTTHINGS_CLIENT_ID, ...body }),
  });
  if (!res.ok) throw new Error(`SmartThings token request failed: ${res.status}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    installed_app_id?: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: new Date(Date.now() + j.expires_in * 1000),
    scopes: j.scope ?? env.SMARTTHINGS_SCOPES,
    ...(j.installed_app_id ? { installedAppId: j.installed_app_id } : {}),
  };
}

export function exchangeCode(env: OAuthEnv, code: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest(
    env,
    { grant_type: "authorization_code", code, redirect_uri: env.SMARTTHINGS_REDIRECT_URI },
    fetchImpl,
  );
}

export function refreshTokens(
  env: OAuthEnv,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
) {
  return tokenRequest(env, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

/** Refresh five minutes before expiry. */
export function needsRefresh(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;
}
