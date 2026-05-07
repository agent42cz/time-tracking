# CLAUDE.md

> Entry point for AI coding agents. Keep this file under 150 lines. When something would push it past the limit, move it into `docs/` and link to it from here. If your agent reads `AGENTS.md` instead, run `ln -s CLAUDE.md AGENTS.md` locally — the symlink is intentionally not committed because prettier can't format symlinks.

## Project overview

Self-hosted, multi-tenant time tracker — Next.js web app + Chrome extension. Users belong to one or more companies, track time against clients/projects, admins get a dashboard with reporting and exports. Czech UI, Europe/Prague timezone. Replaces Clockify with simpler UX and full data ownership.

## Tech stack

- **Language**: TypeScript (strict, `noUncheckedIndexedAccess`)
- **Runtime**: Node 20.11+ on Coolify (Debian VPS)
- **Package manager**: pnpm 11 (pinned), workspaces (`apps/*`, `packages/*`)
- **Web**: Next.js 15 (App Router), React 19, Tailwind, shadcn-style primitives in `packages/ui`, `next-intl` with `cs.json`
- **API**: Next.js route handlers + tRPC; server actions in `apps/web/src/lib/actions/`; service layer in `apps/web/src/lib/services/`
- **DB**: Postgres 16, Prisma 6, schema in `packages/db/prisma/schema.prisma`
- **Auth**: Auth.js v5 (credentials + magic link), argon2id passwords, custom TOTP via `otplib`
- **Real-time**: WebSockets (`apps/ws`) over Redis pub/sub
- **Extension**: Vite + React + MV3 (`apps/extension`), persistent offline queue in `chrome.storage.local`
- **Tests**: Vitest + testcontainers (real Postgres + Redis); Playwright is wired but deferred for v1

## Where to find what

Read these first when starting any task:

- [`docs/constitution.md`](docs/constitution.md) — non-negotiable rules
- [`docs/architecture/`](docs/architecture/) — how the system is built (AS IS)
- [`docs/operations/`](docs/operations/) — run, deploy, troubleshoot
- [`docs/decisions/`](docs/decisions/) — ADRs, append-only
- [`docs/gotchas.md`](docs/gotchas.md) — append-only surprise log
- [`docs/reference/`](docs/reference/) — data model, features (US-1..50), acceptance criteria, env vars
- [`tasks/`](tasks/) — TO BE: in-flight specs and historical task records

## Common commands

```bash
# Install
pnpm install

# Local stack (Postgres 5433, Redis 6380, MailHog 1025/8025)
pnpm db:up
pnpm prisma:generate && pnpm prisma:migrate && pnpm prisma:seed

# Run
pnpm dev                       # all apps in parallel
pnpm --filter @tt/web dev      # web only

# Test
pnpm test                      # vitest unit + integration (testcontainers)
pnpm test:trace                # US-coverage tracker — must hit 100%
pnpm test:all                  # lint + typecheck + everything

# Quality gates
pnpm lint
pnpm typecheck
pnpm build

# Deploy
git push origin main           # CI runs CD job → Coolify deploys via API
```

## Documentation maintenance rules

- After merging a feature, update [`docs/architecture/`](docs/architecture/) so it reflects the live system.
- When making an architectural decision, write a new ADR in [`docs/decisions/`](docs/decisions/) using [`_template.md`](docs/decisions/_template.md). ADRs are append-only — supersede with a new ADR rather than editing.
- When you add a top-level source folder, create a `DESCRIPTION.md` inside it (purpose, public surface, dependencies, used-by, notes).
- When a 20+-minute surprise costs you time, log it in [`docs/gotchas.md`](docs/gotchas.md) as `### YYYY-MM-DD — Symptom` with cause + fix.
- Keep this file under 150 lines. If something belongs in `docs/`, link to it instead of inlining.

## Project-specific rules (full list in `docs/constitution.md`)

- **Tech stack is locked.** No swapping Prisma → Drizzle, pnpm → npm, Auth.js → custom, etc., without an ADR.
- **Tests use real Postgres + Redis via testcontainers.** No DB mocks. Ever.
- **One user-story per `it` block.** Test names embed the US ID: `it('US-21: starts a second timer while one is already running')`.
- **Cross-company 404 tests are mandatory** for every read endpoint and every mutation. Use 404 (not 403) to avoid existence leaks.
- **Every mutation produces exactly one audit row.** Tests assert via `auditCount()`.
- **Czech UI via `next-intl`.** Never hardcode strings in JSX.
- **Coolify uses `expose:`, not `ports:`** in `docker-compose.yml` (Traefik handles routing).
- **No `.only`/`.skip`/`xit`/`xdescribe`** — pre-commit hook blocks. No `console.log` in `apps/` or `packages/`.

## External docs (Context7 MCP)

For up-to-date third-party docs (Next.js 15, Prisma 6, Auth.js v5, Tailwind, Vitest, Playwright, etc.), prefer the Context7 MCP over web search. Use it whenever a library question comes up — your training data may be stale.
