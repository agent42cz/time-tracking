# WS service Docker build. Mirrors docker/web.Dockerfile — see that file
# for why we don't slice the runtime image down.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++ wget
WORKDIR /app
RUN corepack enable
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/ws/package.json apps/ws/
COPY apps/extension/package.json apps/extension/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
COPY . .
RUN pnpm --filter @tt/db prisma:generate
RUN pnpm --filter @tt/ws build

FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat wget
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV WS_PORT=3001
COPY --from=build /app /app
WORKDIR /app/apps/ws
EXPOSE 3001
CMD ["pnpm", "start"]
