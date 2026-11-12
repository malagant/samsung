# samsung

Self-hosted monitoring and control for Samsung EHS heat pumps, built on the
SmartThings API. It replaces dwellsee.com, whose heat-pump monitoring ends on
2026-12-15 when Samsung moves the SmartThings API to paid plans.

## Prerequisites

- Nix with flakes and [direnv](https://direnv.net/) (`nix-direnv` recommended)
- A **SmartThings Developer Plan** ($4.99/month, from 2026-12-15) and an
  API Access App with OAuth in the SmartThings Developer Workspace.
  The plan allows 100,000 API calls per month; the API paces its polling to stay below that.

## Getting started

```sh
direnv allow            # loads the flake dev shell and .envrc
cp .env.example .env.local   # fill in SESSION_SECRET and SmartThings client credentials
just install
just db-up              # local Postgres from the flake
just dev                # api on :8787, web on :5173
just check              # lint, typecheck, tests
```

## Layout

| Path                    | What                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `apps/api`              | Hono API: SmartThings OAuth, webhooks, polling, persistence (Drizzle + Postgres) |
| `apps/web`              | React SPA (Vite, TanStack Router/Query, Tailwind), theme plugins, de/en          |
| `packages/ehs-decoder`  | Decoder for `samsungce.ehsCycleData` hex blobs + FSV catalog                     |
| `packages/theme-kit`    | Theme plugin contract: tokens, fonts, shape, optional shell, contrast checks     |
| `deploy/k8s`            | Kustomize base and `home` overlay                                                |
| `deploy/infrastructure` | CloudNativePG operator (Postgres) via Flux HelmRelease                           |
| `deploy/flux`           | Flux `GitRepository` + `Kustomization`s for the cluster                          |
| `docs/`                 | Reverse-engineering notes (cycle-data layout)                                    |

## Themes

The web app ships three theme plugins: **Glut** (warm, IBM Plex, sidebar), **Fjord** (calm, Manrope, pill navigation) and **Leitstand** (technical, Space Grotesk, hard edges). Each one has a light and a dark palette. Users pick theme, colour scheme and language under _Settings_; the choice is stored in the browser.

To add a theme, create `apps/web/src/themes/<id>/index.tsx` that default-exports `defineTheme({...})` from `@samsung/theme-kit`. The registry picks it up at build time, nothing else needs to change. A theme provides:

- `tokens.light` / `tokens.dark`: colours (`bg`, `surface`, `surface2`, `text`, `muted`, `border`, `accent`, `onAccent`, `heat`, `dhw`, `ok`, `warn`, `idle`) as `#rrggbb`
- `fonts`, `shape` (radius, borders) and `typography` (uppercase labels, numeral font)
- optionally a `Shell` component (the page frame and navigation) and `messages` that override any UI string per language

`pnpm test` fails if a theme breaks the contract or misses WCAG contrast (4.5:1 for text, 3:1 for status colours).

## Languages

UI strings live in `apps/web/src/i18n/locales/<lang>.json` (flat keys, i18next). German is the default and fallback, English is included. To add a language, add a catalogue with the same keys, list it in `LOCALES` in `apps/web/src/i18n/index.ts` and add `lang.<code>` to every catalogue. A test checks that all catalogues have the same keys and placeholders.

## SmartThings data

Once the owner has linked SmartThings (`/auth/smartthings`), the API polls every heat pump on the account: one `GET /devices/{id}/status` per device, at least every `SMARTTHINGS_POLL_INTERVAL_SECONDS` and slower when needed so the month stays within `SMARTTHINGS_MONTHLY_CALL_BUDGET` (20 % is kept back for commands). Webhook events trigger an early poll, at most once a minute. Tokens are refreshed shortly before they expire, and HTTP 429 makes the poller back off.

Each poll becomes one `telemetry` row, raw cycle-data hex included, so history can be decoded again later. The mapping lives in `apps/api/src/telemetry/mapping.ts`. Each value is looked up on a list of candidate components (`main`, `INDOOR`, `INDOOR1`, …), because Samsung spreads values across components differently per model.

Read endpoints for the dashboard: `GET /devices`, `/devices/{id}/latest`, `/devices/{id}/telemetry?hours=24`, `/devices/{id}/fsv` and `/smartthings/status`. They are not behind app login yet.

Migrations in `apps/api/drizzle/` run when the API starts. Database tests run when `TEST_DATABASE_URL` is set: `.envrc` points it at a separate `<db>_test` database, `just db-up` creates that database, and CI starts a Postgres service for them.

## Deployment (Flux)

1. CI builds `ghcr.io/malagant/samsung-{api,web}` on every push to `main`.
2. Put your age public key in `.sops.yaml`, fill `deploy/k8s/overlays/home/secrets.sops.yaml`
   and encrypt it: `sops -e -i deploy/k8s/overlays/home/secrets.sops.yaml`.
3. Set your host in `deploy/k8s/overlays/home/kustomization.yaml`.
4. In the cluster: create `flux-system/sops-age` (age private key) and
   `flux-system/samsung-auth` (repo access), then
   `kubectl apply -f deploy/flux/clusters/home/samsung.yaml`.

The web container proxies `/api/*` to the API service, so the ingress needs a single host.
The SmartThings redirect URI is `https://<host>/api/auth/smartthings/callback`.

### Cyso Cloud (tailnet only)

`deploy/k8s/overlays/cyso` exposes the app only inside the tailnet, through the
[Tailscale Kubernetes operator](https://tailscale.com/kb/1236/kubernetes-operator), at
`https://heatpump.ostrich-morpho.ts.net`. Nothing is reachable from the public internet.
The age key for its secrets lives at `~/.config/sops/age/samsung.txt` (not in the repo).

One-time Tailscale setup in the admin console:

1. Access controls: add `"tagOwners": { "tag:k8s-operator": [], "tag:k8s": ["tag:k8s-operator"] }`.
2. Settings → OAuth clients: create a client with write access to **Devices → Core** and
   **Keys → Auth Keys**, both with tag `tag:k8s-operator`.
3. Save its ID and secret as `CLIENT_ID=…` / `CLIENT_SECRET=…` in
   `~/.config/tailscale/operator-oauth.env`, then encrypt them into the repo:

```bash
SOPS_AGE_KEY_FILE=~/.config/sops/age/samsung.txt deploy/scripts/tailscale-oauth-secret.sh
```

Bootstrap Flux (once):

```bash
kubectl -n flux-system create secret generic sops-age --from-file=age.agekey=$HOME/.config/sops/age/samsung.txt
kubectl apply -f deploy/flux/clusters/cyso/tailscale-operator.yaml
kubectl apply -f deploy/flux/clusters/cyso/samsung.yaml
```

Edit app secrets with `SOPS_AGE_KEY_FILE=~/.config/sops/age/samsung.txt sops deploy/k8s/overlays/cyso/secrets.sops.yaml`.
The SmartThings redirect URI for this setup is
`https://heatpump.ostrich-morpho.ts.net/api/auth/smartthings/callback`. SmartThings
webhooks cannot reach a tailnet address, so the app relies on polling there.
For debugging, `kubectl -n samsung port-forward svc/web 8080:80` still works.
