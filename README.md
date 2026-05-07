# Time Tracker

Self-hosted, multi-tenant time tracker — Next.js web app + Chrome extension. Czech UI, Europe/Prague timezone. Built per the [feature catalogue](docs/reference/features.md) (US-1 … US-50).

## Documentation

- **[`CLAUDE.md`](CLAUDE.md)** — entry point for AI agents (and a fast orientation for humans).
- **[`docs/`](docs/)** — current system state (architecture, reference, operations, business, decisions, gotchas).
- **[`tasks/`](tasks/)** — TO BE specs and historical task records.

## Local development

Prereqs: Node 20.11+, pnpm 11+, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up                  # postgres:5433, redis:6380, mailhog:1025/8025
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

- Web: <http://localhost:3000>
- MailHog: <http://localhost:8025>
- Healthcheck: <http://localhost:3000/api/health>

Full walkthrough: [`docs/operations/local-development.md`](docs/operations/local-development.md).

## Tests

| Command             | Scope                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm test`         | Vitest unit + integration (real Postgres + Redis via testcontainers) |
| `pnpm test:trace`   | US coverage tracker — fails if any US-1..50 has zero matching tests  |
| `pnpm test:e2e`     | Playwright web E2E (deferred for v1)                                 |
| `pnpm test:e2e:ext` | Playwright Chrome-extension E2E (deferred for v1)                    |
| `pnpm test:all`     | Lint + typecheck + everything above (CI default)                     |

## Repository layout

```
apps/web         Next.js 15 (App Router, React 19, Tailwind, next-intl)
apps/ws          WebSocket server (ws + Redis pub/sub)
apps/extension   Chrome MV3 popup (Vite + React)
packages/db      Prisma schema + client + testcontainers harness
packages/shared  Zod validators, time helpers, WS wire types
packages/ui      Shared UI primitives (web + extension popup)
docker/          Production Dockerfiles
docs/            AS IS documentation
tasks/           TO BE specs + historical task records
docker-compose.dev.yml   Local stack
docker-compose.yml       Coolify-deployable stack
```

See [`docs/architecture/README.md`](docs/architecture/README.md) for the full system shape.

## Deployment

Production target is Coolify. Walkthrough + env-var reference: [`docs/operations/coolify-deploy.md`](docs/operations/coolify-deploy.md).

## How AI agents work on this repo

Read [`CLAUDE.md`](CLAUDE.md) and [`docs/constitution.md`](docs/constitution.md). Short version: test-first, real Postgres (no DB mocks), one US per `it`, every mutation has an audit row + a cross-company 404 test.
