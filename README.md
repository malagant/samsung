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
| `apps/web`              | React SPA (Vite, TanStack Router/Query, Tailwind), light and dark mode           |
| `packages/ehs-decoder`  | Decoder for `samsungce.ehsCycleData` hex blobs + FSV catalog                     |
| `deploy/k8s`            | Kustomize base and `home` overlay                                                |
| `deploy/infrastructure` | CloudNativePG operator (Postgres) via Flux HelmRelease                           |
| `deploy/flux`           | Flux `GitRepository` + `Kustomization`s for the cluster                          |
| `docs/`                 | Reverse-engineering notes (cycle-data layout)                                    |

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
