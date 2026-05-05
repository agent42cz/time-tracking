# Web app build (Next.js standalone output).
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
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
WORKDIR /app
RUN apk add --no-cache libc6-compat wget
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
# Next standalone tracing misses Prisma's dynamically-loaded engine binaries
# and argon2's native bindings. Copy the full build-time node_modules so
# everything is reliably available at runtime (image grows ~200 MB; worth
# it for a deploy that actually starts).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
