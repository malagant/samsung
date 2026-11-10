# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/ehs-decoder/package.json packages/ehs-decoder/
RUN pnpm install --frozen-lockfile --filter @samsung/api...
COPY packages/ehs-decoder packages/ehs-decoder
COPY apps/api apps/api
RUN pnpm --filter @samsung/ehs-decoder build \
 && pnpm --filter @samsung/api build \
 && pnpm --filter @samsung/api deploy --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER node
EXPOSE 8787
CMD ["node", "dist/server.js"]
