# `apps/web/src/lib`

> Server-side application code: services, server actions, route helpers, auth primitives.

## Purpose

This folder is where the business logic of the web app lives — everything that runs on the server in service of route handlers, server actions, and tRPC procedures. Pages and components consume this layer; they should not duplicate logic that already exists here.

## Layout

| Folder      | Purpose                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/` | Pure-ish service functions: domain logic, Prisma calls, audit writes, WS publishes. Tested by `apps/web/tests/services/*.test.ts` against testcontainers Postgres + Redis. |
| `actions/`  | Next.js Server Actions called from forms (auth, catalog, companies, time). Thin wrappers over `services/` with redirect/revalidation glue.                                 |
| `auth/`     | Auth.js v5 setup + custom flows (signup, password login + lockout, magic link, password reset, TOTP enrollment + verification, recovery codes, sessions).                  |
| `api/`      | Route-handler helpers: API auth (Bearer token verification for the extension), CORS for cross-origin requests from the extension, IP-level rate limiting.                  |

`session.ts`, `realtime.ts`, and other top-level files in `lib/` are loaded by both pages and route handlers — `session.requireUser()` is the page-level auth gate; `realtime.publishTimeEntry()` etc. are called by services after every mutation.

## Public surface

The most-touched exports:

- `services/audit.ts::writeAudit(db, input)` — **must be called exactly once per mutation**. The audit-log immutability boundary test (in `tests/services/audit.test.ts`) greps every `services/*` file and fails if anything other than this helper writes to `auditLog`.
- `services/time-entries.ts` — `startTimer`, `stopTimer`, `createManual`, `updateEntry`, `softDelete`, `restore`, `listForUser`, `listWeek`, `listTrash`, `purgeOldDeleted`, `getHistory`.
- `services/companies.ts` — `createCompany`, `listMyCompanies`, `createInvite`, `revokeInvite`, `resendInvite`, `changeRole`, `removeMember`, `leaveCompany`, `deleteCompany`.
- `services/catalog.ts` — clients, projects, tags CRUD with archive + cascade.
- `services/dashboard.ts` / `services/reports.ts` — read-side aggregates and filterable exports.
- `auth/sessions.ts` — 30-day sliding session.
- `auth/totp.ts` / `auth/totp-enrollment.ts` — `otplib`-based 2FA with single-use recovery codes.

## Dependencies

- **Internal:** `@tt/db` (Prisma client + types), `@tt/shared` (Zod validators, time helpers, WS wire types).
- **External:** `@prisma/client`, `next-auth@beta`, `@auth/prisma-adapter`, `argon2`, `otplib`, `nodemailer`, `ioredis` (for WS publish via Redis), `next-intl` (server-side translations).

## Used by

- **Pages and layouts** in `apps/web/src/app/` consume services directly (Server Components) and post to `actions/` (forms).
- **Route handlers** in `apps/web/src/app/api/` use `api/` helpers for auth/CORS, then call services.
- **The Chrome extension** authenticates via the `api/auth.ts` Bearer-token surface and hits the same service layer through public route handlers.

## Notes

- **Pure-ish.** Services accept a `Db` parameter (`PrismaClient | Prisma.TransactionClient`) so tests can run them inside a transaction that rolls back at teardown. They also accept the actor identity rather than reading from the session, which keeps them callable from cron jobs and the route layer alike.
- **Result type.** Most services return `{ ok: true, value: T } | { ok: false, reason: 'not_found' | ... }` instead of throwing. The route layer maps reasons to HTTP status (`not_found` → 404). This is what makes the cross-company 404 rule (see `docs/constitution.md` §3) cheap to implement consistently.
- **Audit + WS publish are coupled to mutations.** A new mutation should: call `writeAudit()`, publish to Redis via `realtime.ts`, return a result. If you find yourself doing only one of those, you've probably got a bug.
- **No DB mocks.** Tests use real Postgres via `@tt/db/test`. If a service is hard to test without mocks, the design is wrong — fix the design.
