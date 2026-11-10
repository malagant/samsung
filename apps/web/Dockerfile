# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/theme-kit/package.json packages/theme-kit/
RUN pnpm install --frozen-lockfile --filter @samsung/web...
COPY packages/theme-kit packages/theme-kit
COPY apps/web apps/web
RUN pnpm --filter @samsung/web build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
