# Build progress log

Append-only. One entry per phase per the build prompt.

## Phase 0 — Repository bootstrap

- Started: 2026-05-03
- Scope: pnpm workspaces, TypeScript strict everywhere, ESLint flat config (with no-only-tests + no-console-in-src custom rules), Prettier, Husky pre-commit + lint-staged, root scripts (`test`, `test:trace`, `test:e2e`, `test:e2e:ext`, `test:all`, `lint`, `typecheck`, `build`), `docker-compose.dev.yml` with Postgres 16 + Redis 7 + MailHog, `.github/workflows/ci.yml`, app/package skeletons, `scripts/test-trace.ts` (US coverage tracker against PRD §13).
- Layout: `apps/{web,ws,extension}` + `packages/{db,shared,ui}` per BUILD-PROMPT.md §5.
- US covered: none yet (this is bootstrap only).
- Finished: 2026-05-03

## Phase 1 — Database schema

- Started: 2026-05-03
- Scope: Prisma schema (PRD §3.1) + Auth.js v5 tables + auth helpers (TOTP recovery, password attempts, magic links). testcontainers harness with `getTestPrisma`/`withTx`/`resetDb`. Deterministic seed (PRD §14.4) producing 2 companies, 1 cross-company user, clients/projects/tags/entries anchored to 2026-05-01.
- Tests: 6 schema constraint tests + 4 seed verification tests, all green against real Postgres 16 via testcontainers.
- US covered: none directly (foundational).
- Finished: 2026-05-03
