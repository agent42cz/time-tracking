# Time Tracker

Self-hosted, multi-tenant time tracker — web app + Chrome extension. Built per `PRD-time-tracker.md`. Czech UI, Europe/Prague.

## Local development

Prereqs: Node.js 20.11+, pnpm 11+, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up                # postgres:5433, redis:6380, mailhog:1025/8025
pnpm prisma:generate
pnpm prisma:migrate       # creates dev DB schema
pnpm prisma:seed          # deterministic seed (PRD §14.4)
pnpm dev
```

Web app: http://localhost:3000 · MailHog UI: http://localhost:8025

## Test commands

| Command | Scope |
|---------|-------|
| `pnpm test` | Vitest unit + integration (real Postgres via testcontainers) |
| `pnpm test:trace` | US coverage tracker — fails if any US-1..50 has zero tests |
| `pnpm test:e2e` | Playwright web E2E |
| `pnpm test:e2e:ext` | Playwright Chrome extension E2E |
| `pnpm test:all` | Lint + typecheck + everything above (CI default) |

## Repository layout

```
apps/web         Next.js 15 (App Router, React 19, TS strict, Tailwind, shadcn)
apps/ws          WebSocket service (ws + Redis pub/sub)
apps/extension   Chrome MV3 popup (Vite + React)
packages/db      Prisma schema + client + test harness
packages/shared  Zod validators, time helpers, WS wire types
packages/ui      Shared UI primitives (web + extension popup)
```

## Deployment to Coolify

Production compose is `docker-compose.yml` (web, ws, postgres, redis, db-backup). Services use `expose:` so Coolify's Traefik routes internally — do not bind host ports.

Required env vars (set in Coolify):

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection string
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` / `APP_URL` — public origin
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `WS_PUBLIC_URL` — public wss URL of the ws service
- `BACKUP_DESTINATION` — local path or S3 URL for nightly Postgres dumps

Healthcheck: `GET /api/health` returns 200 with `{ db, redis }` status.

## How AI agents work on this repo

See PRD §14.8 and `BUILD-PROMPT.md`. Short version: test-first, real Postgres (no DB mocks), one US per `it`, every mutation has an audit row + a cross-company 404 test.
