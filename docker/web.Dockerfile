# Web app Docker build.
#
# Two stages: build (compile + prisma generate) → runtime (next start).
# We deliberately don'"'"'t use Next.js standalone output: @vercel/nft tracing
# is fragile in pnpm workspaces (Prisma engine binaries + argon2 native
# bindings get missed). Instead we copy the full repo + node_modules and
# run `next start` against it. ~150-200 MB heavier but reliably starts.
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
RUN pnpm --filter @tt/web build

FROM node:22-alpine AS runtime
RUN apk add --no-cache libc6-compat wget
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
# pnpm knows where next is regardless of which layout pnpm install used.
# Wrap in a shell so any startup failure surfaces a clear log line and
# the container stays alive long enough for `coolify application_logs`
# to capture stdout/stderr.
CMD ["sh", "-c", "set -x; pnpm start; echo NEXT_EXITED_WITH_CODE=$?; sleep 600"]
