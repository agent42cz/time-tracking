# Local development

Prereqs: Node 20.11+, pnpm 11+, Docker.

## First-time setup

```bash
cp .env.example .env
pnpm install
pnpm db:up                  # postgres:5433, redis:6380, mailhog:1025/8025
pnpm prisma:generate
pnpm prisma:migrate         # creates dev DB schema
pnpm prisma:seed            # deterministic seed (PRD §14.4 fixture)
pnpm dev
```

- Web app: <http://localhost:3000>
- MailHog UI (captures outbound mail in dev): <http://localhost:8025>
- Healthcheck: <http://localhost:3000/api/health>

The dev stack uses non-default host ports to avoid colliding with other Postgres/Redis instances on your machine — see [`../decisions/0005-local-dev-port-offsets.md`](../decisions/0005-local-dev-port-offsets.md).

## Tests

| Command             | Scope                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm test`         | Vitest unit + integration (real Postgres + Redis via testcontainers) |
| `pnpm test:trace`   | US-coverage tracker — fails if any US-1..50 has zero matching tests  |
| `pnpm test:e2e`     | Playwright web E2E (deferred for v1)                                 |
| `pnpm test:e2e:ext` | Playwright Chrome-extension E2E (deferred for v1)                    |
| `pnpm test:all`     | Lint + typecheck + everything above (CI default)                     |

Testcontainers spin up an ephemeral Postgres + Redis for every test run. First run pulls the images; subsequent runs reuse the cache. Wall-clock for the full suite is ~100s.

## Working on a single workspace

```bash
pnpm --filter @tt/web dev
pnpm --filter @tt/web test -- path/to/file
pnpm --filter @tt/web typecheck
```

## Resetting state

```bash
pnpm db:down                # stops the dev stack
pnpm db:reset               # drops + re-creates DB volume, re-runs migrations + seed
```
