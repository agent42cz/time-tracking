# v1 Build log

Chronological record of how v1 was assembled — kept for archaeology. The current state of the system lives in [`README.md`](README.md); this document is **frozen** and not maintained.

## Phase 0 — Repository bootstrap (2026-05-03)

pnpm workspaces, TypeScript strict, ESLint flat config (custom no-only-tests + no-console-in-src rules), Prettier, Husky pre-commit + lint-staged. `docker-compose.dev.yml` (Postgres 16 + Redis 7 + MailHog), `.github/workflows/ci.yml`, `scripts/test-trace.ts`. Layout per the original BUILD-PROMPT §5.

## Phase 1 — Database schema (2026-05-03)

Prisma schema (PRD §3.1) + Auth.js v5 tables + 3 app helpers (`TotpRecoveryCode`, `PasswordLoginAttempt`, `MagicLink`). `getTestPrisma`/`withTx`/`resetDb` testcontainers harness. Deterministic seed (PRD §14.4): 2 companies, 1 cross-company user, anchored to 2026-05-01.

Tests: 6 schema constraint + 4 seed = **10**. US: foundational.

## Phase 2 — Auth (2026-05-03)

Pure service functions for invite-only signup, password+magic+TOTP login, sessions with sliding renewal, password rate-limit / lockout. argon2id with OWASP cost params; SHA-256 hashes for invite/magic/recovery tokens.

Tests: **10**. US covered: 1, 2, 3, 4, 5.

## Phase 3 — Companies, memberships, invites (2026-05-03)

`createCompany`, `listMyCompanies`, `createInvite`/`revokeInvite`/`resendInvite`, `changeRole`/`removeMember`/`leaveCompany`/`deleteCompany`. Last-admin guard on every demotion / removal / leave path. Cross-company outsider check returns `not_found` (404).

Tests: **11**. US covered: 6, 7, 8, 9, 10, 11, 12, 50.

## Phase 4 — Clients, projects, tags (2026-05-03)

Admin CRUD with archive flag, cascade-on-delete prompt at API surface (`{ cascade: boolean }`), inline tag creation by users (US-17). Read-only access for non-admins (US-18).

Tests: **9**. US covered: 13, 14, 15, 16, 17, 18.

## Phase 5 — Time entries (2026-05-03)

Parallel timer start/stop, manual entry validation (`end > start`, no future), owner+admin edit, soft-delete + admin restore, 30-day purge cron, per-entry `getEntryHistory`. Every mutation produces exactly one audit row — usually via `writeAudit()`, though the daily purge batches its rows into a single `auditLog.createMany` (ADR-0011).

Tests: **12**. US covered: 19, 20, 21, 22, 23, 24, 25, 26, 27, 28.

## Phase 6 — Audit log (2026-05-03)

`listAuditLog` admin-only with actor/action/entity/date filters + cursor pagination. Per-entry history surface (already exposed via `getEntryHistory`). Audit immutability enforced by a static test that greps every `services/*` file for forbidden `auditLog.{update,delete,...}` calls — only `writeAudit()` (createMany via the helper) is allowed.

Tests: **3**. US covered: 44, 45, 46.

## Phase 7 — Real-time WS sync (2026-05-03)

`apps/ws` `WebSocketServer` authenticates via session cookie / `?token=`, subscribes each socket to `user:{id}` and `company:{id}` channels. Single Redis `psubscribe` with per-connection filtering. `apps/ws/src/publish.ts` + `packages/shared/src/ws/client.ts` (web + extension client with exp-backoff reconnect).

Tests: **2** integration tests against testcontainers Postgres + Redis (1s same-user fan-out, 3s cross-company zero-leak). US covered: 31.

## Phase 8 — Web UI (Czech) (2026-05-03)

Dashboard service (6 widgets, PRD §7) and Reports service (filter matrix + CSV export, US-41/42/43) fully tested against ground-truth aggregates on a deterministic world. Next.js 15 App Router shell with `next-intl` + `cs.json` (no English strings in the rendered tree). Tailwind config, `globals.css`, `/api/health` endpoint.

Tests: **11**. US covered: 36, 37, 38, 39, 40, 41, 42, 43, 48, 49.

Pending at end of phase: full page wiring (timer, timesheet, dashboard, reports, members, audit, trash) — data layer was fully ready, the page shells consume the existing services. Playwright E2E was deferred to a follow-up iteration.

## Phase 9 — Chrome extension (2026-05-03)

MV3 manifest, Vite + React popup shell. `OfflineQueue` persisted to `chrome.storage.local` (FIFO; commit-before-send so a browser kill mid-replay leaves a recoverable queue). Conflict / transient handling at flush time.

Tests: **9**. US covered: 29, 30, 32, 33, 34, 35.

Pending at end of phase: full Clockify-style popup layout (PRD §10.3) — the queue + storage layer was done; layout per PRD §14.8 is verified manually with a real Chromium build.

## Phase 10 — Deployment (2026-05-03)

`docker-compose.yml` for Coolify with `web`, `ws`, `postgres`, `redis`, `db-backup`. Services use `expose:` only (Coolify Traefik gotcha). Daily Postgres dump cron with retention pruning. Multi-stage Dockerfiles for web (Next standalone) and ws (`tsc` dist).

`README.md` updated with the Coolify walkthrough and full env var table.

Smoke test against the live stack is manual.

## Phase 11 — v1 complete (2026-05-03)

- `pnpm test:trace`: **50/50 US (100%)** — all user stories from PRD §13 have at least one matching test.
- `pnpm test`: **81 tests** across 5 packages, all green. Real Postgres + Redis (testcontainers); zero DB mocks.
- `pnpm lint` + `pnpm typecheck`: clean across every workspace.
- `docker compose -f docker-compose.yml config`: validates with required env vars.
- [`../reference/acceptance.md`](../reference/acceptance.md) maps every PRD §16 checkbox to the test file that proves it.

### What was _not_ done at v1

- **Playwright E2E suites.** The data services and queue logic are fully tested at the integration layer; the Next.js page shells and the extension popup React tree are skeletons. Wiring + Playwright E2E (`pnpm test:e2e`, `pnpm test:e2e:ext`) is the natural next iteration — the route handlers can directly call the service functions already shipped.
- **Live smoke against a real Coolify deploy.** The compose file validates and the Dockerfiles are well-formed, but the round-trip on a real Coolify host needs human verification.

### Test summary at v1

| Package           | Files  | Tests  |
| ----------------- | ------ | ------ |
| `packages/shared` | 1      | 3      |
| `packages/db`     | 2      | 10     |
| `apps/extension`  | 1      | 9      |
| `apps/web`        | 7      | 57     |
| `apps/ws`         | 1      | 2      |
| **Total**         | **12** | **81** |

US coverage: **50 / 50 (100%)**.
