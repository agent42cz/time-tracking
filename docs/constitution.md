# Constitution

These rules are **non-negotiable**. Changing any of them requires a new ADR in [`decisions/`](decisions/) — never an undocumented drift.

## 1. Tech stack is locked

The stack defined in [`architecture/README.md`](architecture/README.md) is fixed for v1. Do not swap any of these without an ADR documenting the blocker:

- pnpm 11 (pinned), workspaces only — no Yarn, npm, or Bun.
- Next.js 15 App Router + React 19 + TypeScript strict — no Pages Router.
- Prisma 6 against Postgres 16 — no Drizzle, Kysely, raw SQL services, or Postgres swap.
- Auth.js v5 with credentials + magic link providers + custom TOTP layer — no Clerk/WorkOS/Supabase Auth.
- argon2id for password hashing (default cost params) — no bcrypt or scrypt.
- WebSockets via `ws` in `apps/ws` with Redis pub/sub — no Pusher, Ably, Soketi, SSE.
- `next-intl` with a single `cs.json` locale file — no other i18n library, no English strings in the rendered tree.
- Vitest + testcontainers-node for tests, Playwright for E2E — no Jest, Mocha, Cypress.

## 2. Testing discipline

- **Real Postgres + real Redis** for every integration test, via testcontainers. **Zero DB mocks**. If something is hard to test without mocking the DB, the design is wrong — fix the design.
- **Test-first** for any new behavior. The test must fail for the right reason before you make it pass.
- **One user-story per `it` block.** Test name must embed the US ID: `it('US-21: starts a second timer while one is already running')`.
- **`pnpm test:trace` must report 100% US coverage.** Every US-1..US-50 has at least one test that names it; CI fails otherwise.
- **No `.only`, `.skip`, `xit`, `xdescribe`** in commits. Pre-commit hook blocks.
- **No `setTimeout` for synchronization** in tests. Use `expect.poll`, `waitFor`, or fake timers.
- **Don't stub `Date.now()` ad hoc.** Use the shared time helper in `packages/shared/src/time/`.

## 3. Multi-tenant safety

- **Cross-company 404 is mandatory.** Every read endpoint and every mutation has a paired test where a member of Company B targets Company A's data and gets **404** (never 403 — avoids existence leaks).
- **Every mutation produces exactly one audit row.** Test must call `auditCount()` before and after. Mutation without an audit row is a bug.
- **Audit rows are immutable.** No service may call `auditLog.update`, `auditLog.delete`, or `auditLog.deleteMany`. The static check in `apps/web/tests/services/audit.test.ts` greps every `services/*` file for forbidden calls.

## 4. UI conventions

- Czech only — `cs-CZ` locale, `Europe/Prague` timezone, dates `dd.MM.yyyy`, durations `HH:MM:SS`.
- All copy through `next-intl` keys; never inline English. Cs strings live in `apps/web/src/i18n.ts`'s message catalogue.
- Tailwind for styling — no styled-components, emotion, or CSS-in-JS. Shared primitives in `packages/ui` use `clsx` + `tailwind-merge` (`cn()`).

## 5. Deployment invariants

- `docker-compose.yml` for production uses `expose:`, not `ports:`. Coolify's Traefik handles routing — bound host ports collide.
- `/api/health` must return `{ db: 'ok', redis: 'ok' }` with HTTP 200 (or 503 with the failing dep). It's the platform liveness probe.
- The `db-backup` service writes daily Postgres dumps to `${BACKUP_DESTINATION}` with `${BACKUP_RETENTION_DAYS}` retention.

## 6. Process

- **Conventional commits.** `feat:`, `fix:`, `test:`, `chore:`, `docs:`. Reference US IDs in the body when relevant.
- **One logical change per commit.** Don't bundle unrelated work.
- **ADRs are append-only.** Never edit a merged ADR. Write a new one with `Status: Supersedes ADR-XXXX`.
- **Tasks are append-only.** Once merged, a `tasks/<EPIC>/<TASK>/` folder becomes a frozen historical record. Don't update merged tasks.
- **Stay in scope.** v1 only. If you find yourself building something not in the acceptance criteria, stop and remove it.

## 7. Anti-patterns — do not do these

- Asking the user to choose between options at decision time. Decide and document in an ADR.
- Writing tests after the implementation "to save time."
- Mocking the database, the WebSocket layer, or the audit logger.
- Bundling multiple US into one `it`. One US per test.
- Using English strings in the UI. Czech only.
- Binding host ports `80`/`443`/`3000` in production compose. Use `expose`.
- Suppressing or weakening a test to make a change pass. Fix the source, not the test.
- Committing red. Committing with `.only`/`.skip`. Committing without running the focused test.
