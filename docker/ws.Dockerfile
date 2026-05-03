# WS service build.
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ws/package.json apps/ws/
COPY apps/web/package.json apps/web/
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
WORKDIR /app
RUN apk add --no-cache libc6-compat wget
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/ws/dist ./apps/ws/dist
COPY --from=build /app/packages ./packages
EXPOSE 3001
CMD ["node", "apps/ws/dist/index.js"]
