# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

# Public Discord Client ID passed at build time for Vite frontend (NEVER pass Client Secret here!)
ARG VITE_DISCORD_CLIENT_ID=""
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID

RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV SERVE_STATIC=true
ENV ALLOW_DEV_AUTH=false

COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/packages/game-core/package.json ./packages/game-core/
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/packages/game-core/dist ./packages/game-core/dist
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/scripts ./scripts

RUN pnpm install --prod --frozen-lockfile --filter @together/server...

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "scripts/start-activity.mjs"]
