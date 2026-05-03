# Time Tracker

Self-hosted, multi-tenant time tracker — web app + Chrome extension. Built per `PRD-time-tracker.md`. Czech UI, Europe/Prague timezone.

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

- Web app: http://localhost:3000
- MailHog UI: http://localhost:8025
- Healthcheck: http://localhost:3000/api/health

## Test commands

| Command | Scope |
|---------|-------|
| `pnpm test` | Vitest unit + integration (real Postgres + Redis via testcontainers) |
| `pnpm test:trace` | US coverage tracker — fails if any US-1..50 has zero matching tests |
| `pnpm test:e2e` | Playwright web E2E |
| `pnpm test:e2e:ext` | Playwright Chrome extension E2E |
| `pnpm test:all` | Lint + typecheck + everything above (CI default) |

## Repository layout

```
apps/web         Next.js 15 (App Router, React 19, TS strict, Tailwind, next-intl)
apps/ws          WebSocket server (ws + Redis pub/sub)
apps/extension   Chrome MV3 popup (Vite + React)
packages/db      Prisma schema + client + testcontainers harness
packages/shared  Zod validators, time helpers, WS wire types + client
packages/ui      Shared UI primitives (web + extension popup)
docker/          Production Dockerfiles
docker-compose.dev.yml   Local stack
docker-compose.yml       Coolify-deployable stack
```

## Deployment to Coolify

The production compose file is `docker-compose.yml`. Services use `expose:` so Coolify's Traefik routes internally — never bind host ports (`80/443/3000`) on the same node, those collide with Traefik.

### Required environment variables

| Var | Notes |
|-----|-------|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Postgres credentials |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` / `APP_URL` | Public origin of the web app |
| `WS_PUBLIC_URL` | Public `wss://` URL of the WS service |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Coolify-level SMTP |
| `BACKUP_DESTINATION` | Volume path for nightly Postgres dumps |
| `BACKUP_RETENTION_DAYS` | Default 14 |

### Coolify steps

1. Connect the repo to Coolify.
2. Choose "Docker Compose" deployment, select `docker-compose.yml`.
3. Set the env vars above in the Coolify dashboard.
4. Coolify provisions Traefik labels for the `web` service. Point your domain at the Coolify host; Coolify handles HTTPS via Let's Encrypt.
5. The `db-backup` service writes daily dumps to `${BACKUP_DESTINATION}` on the host.
6. Healthcheck: `GET /api/health` returns `{ db: 'ok', redis: 'ok' }` with HTTP 200; 503 otherwise.

### First-run bootstrap

The first user is created via the seed (CLI on the host):

```bash
docker compose run --rm web node packages/db/dist/seed.js
```

Or a direct invite (skip seed): connect to the `web` service shell and run a Prisma script that creates an `Invite` row for your email; visit the invite URL to register.

## How AI agents work on this repo

See PRD §14.8 and `BUILD-PROMPT.md`. Short version: test-first, real Postgres (no DB mocks), one US per `it`, every mutation has an audit row + a cross-company 404 test.
