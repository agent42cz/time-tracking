# `packages/db/src`

> Prisma client re-export, deterministic seed, and the testcontainers harness used by every integration test.

## Purpose

`packages/db` is the single dependency point for "the database" anywhere in the monorepo. It exports the Prisma client, a deterministic seed, and a real-Postgres testcontainers harness that gives tests a fresh schema + transactional rollback per test.

## Public surface

| Path                  | Export                                     | Purpose                                                                                                                                                                                                                     |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`            | `prisma`, all Prisma types                 | Default Prisma client, configured with the right env-var DSN.                                                                                                                                                               |
| `seed.ts`             | (script)                                   | Deterministic seed matching PRD §14.4 — 2 companies, 1 cross-company user (Admin in A, User in B), 2 single-company users, clients/projects/tags/entries on known dates anchored at 2026-05-01. Run via `pnpm prisma:seed`. |
| `test/index.ts`       | `getTestPrisma()`, `withTx()`, `resetDb()` | testcontainers-driven harness for integration tests.                                                                                                                                                                        |
| `test/schema.test.ts` | (test)                                     | Schema constraint tests (unique membership, cascade rules at DB level).                                                                                                                                                     |
| `test/seed.test.ts`   | (test)                                     | Asserts the seed produces the expected world.                                                                                                                                                                               |

The `package.json` exports map:

- `.` → the Prisma client (`./src/index.ts`).
- `./test` → the harness (`./src/test/index.ts`).
- `./seed` → the seed entry point (`./src/seed.ts`).

## Test harness

`getTestPrisma()` boots a Postgres container on first call and reuses it across the worker. Each test wraps its work in `withTx(prisma, async (tx) => { ... })`, which begins a transaction and rolls back at teardown. The result is **zero shared state between tests**, which is what makes the cross-company 404 matrix tractable.

`resetDb()` is the heavy reset for tests that genuinely need a clean slate (e.g., the seed test).

## Dependencies

- **Internal:** Prisma schema in `packages/db/prisma/`.
- **External:** `@prisma/client` (runtime), `prisma` (CLI/migrations), `argon2` (the seed creates real password hashes), `testcontainers` + `@testcontainers/postgresql` (test harness only).

## Used by

- `apps/web` — every service in `apps/web/src/lib/services/` accepts a `PrismaClient | Prisma.TransactionClient` so it can be called from production routes (with the default client) or from tests (with a transaction client).
- `apps/ws` — uses the Prisma client to validate session tokens on connection.
- Every integration test in the monorepo that touches the DB.

## Notes

- **No DB mocks.** This is a constitutional rule (see `docs/constitution.md` §2). If a service is hard to test without mocks, the design is wrong — fix the design.
- **Seed is deterministic.** Anchored to 2026-05-01 with stable IDs so dashboard / reports tests can assert exact aggregates against ground-truth SQL.
- **First test run pulls the Postgres image**; subsequent runs reuse the cached image. CI keeps a hot image cache. Wall-clock for the full integration suite is ~100s.
