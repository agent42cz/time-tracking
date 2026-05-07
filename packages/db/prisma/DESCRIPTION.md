# `packages/db/prisma`

> Prisma schema — source of truth for the data model.

## Purpose

The schema in `schema.prisma` is the canonical description of every entity, relation, index, and constraint. Anything else that documents the data model (e.g., [`docs/reference/data-model.md`](../../../docs/reference/data-model.md)) is derived from this file; if a doc disagrees, the schema wins and the doc is updated.

## What's in it

- **Domain entities** (PRD §3.1): `User`, `Company`, `Membership`, `Invite`, `Client`, `Project`, `Tag`, `TimeEntry`, `AuditLog`.
- **Auth.js v5 tables** for the Prisma adapter: `Account`, `Session`, `VerificationToken`.
- **App-specific helpers** for custom auth flows: `MagicLink`, `PasswordLoginAttempt`, `TotpRecoveryCode`.
- **Indexes and unique constraints** for hot read paths and integrity (`Membership(user_id, company_id)` unique, etc.).

## Migrations

Migrations live in `prisma/migrations/`. Discipline:

- **One migration per logical change.** Bundling unrelated schema changes makes review hard and makes targeted rollback impossible.
- **Don't edit applied migrations.** If you need to fix a bug in a migration that's already been deployed, write a new migration that corrects state.
- **Generate via Prisma** (`pnpm prisma:migrate`). Hand-rolled SQL only when Prisma can't express what you need; always include a comment explaining why.
- **The CI pipeline applies migrations against an ephemeral DB** before running tests. Drift between schema and migrations is caught there.

## Dependencies

- **Internal:** generates the typed client used by `apps/web`, `apps/ws`, and `packages/db/src/seed.ts`.
- **External:** `prisma` CLI for migrations and code generation, `@prisma/client` at runtime.

## Used by

Every layer that reads or writes the database — services in `apps/web/src/lib/services/`, the seed in `packages/db/src/seed.ts`, the testcontainers harness in `packages/db/src/test/`, and the WS service for session validation.

## Notes

- **Audit immutability** is enforced at the application layer, not at the schema level. There's no DB constraint preventing `auditLog.update`; the static test in `apps/web/tests/services/audit.test.ts` greps every `services/*` file for forbidden calls. Don't add a Prisma operation that mutates `AuditLog` through any code path.
- **Soft delete** uses `deleted_at TIMESTAMP NULL` on `TimeEntry`. The schema does not enforce "select where deleted_at is null" — that filter lives in the service layer (and tests assert it).
- **Cascade rules** in the schema express only the structural deletes (e.g., `Membership` is removed when a `User` is hard-deleted, which we never do). The user-facing cascade prompt for client/project deletion is handled in `services/catalog.ts` and operates on soft-delete state.
