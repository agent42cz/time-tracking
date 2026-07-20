# 0012 — Propose `prisma migrate deploy` over `db push` in production

- **Status:** Proposed
- **Date:** 2026-07-08
- **Deciders:** Michal Lénert
- **Related:** AIAGE-51, [`0011-coolify-scheduled-task-for-purge.md`](0011-coolify-scheduled-task-for-purge.md)

## Context

Nothing in this repository applies `packages/db/prisma/migrations/`. Three
places reconcile the live database to `schema.prisma` with
`prisma db push --skip-generate --accept-data-loss` instead:

- `docker/web.Dockerfile:40` runs it on **every production container start**,
  before `next start`.
- `.github/workflows/ci.yml:95` runs it against the CI Postgres before the
  e2e suite.
- `packages/db/src/test/index.ts:40` runs it against each testcontainers
  Postgres before the integration suite.

`db push` diffs the live database against `schema.prisma` and applies
whatever is needed to match — no generated SQL to review, no migration file,
no operator confirmation. `--accept-data-loss` is what makes that diff apply
even when it is destructive: if a field is narrowed or removed from
`schema.prisma`, the next production container start drops that column's
data, silently, with no prompt and no way to say no. The flag's own name says
so.

This is not hypothetical. During Task 8 of this branch we found that
`TimeEntry.note` had been added to `schema.prisma` in commit `b4d9c98` with
no corresponding migration file — the migrations directory had drifted from
the schema and nothing failed, because nothing in CI, tests, or production
ever applies the migrations directory. `db push` papered over the gap in
every environment that matters, which is exactly why it went unnoticed.

## Decision

Propose that the production container (`docker/web.Dockerfile`) run
`prisma migrate deploy` instead of `db push`, applying the reviewed,
version-controlled migration files in `packages/db/prisma/migrations/`.
Confine `db push` to tests and local development, where the database is
disposable (a fresh testcontainer, or a throwaway local Postgres) and
"reconcile without a paper trail" is the right tool, not a liability.

This ADR does not implement the change — `docker/web.Dockerfile` is
untouched. It records the decision for a human to act on.

## Alternatives considered

### Alternative A — Keep `db push` everywhere

Simpler: one command, no migration-file discipline required, and it has
worked in the sense that the app has stayed up. Rejected because the failure
mode is not "deploy breaks and you notice" — it is silent data loss on a
column that used to hold real rows, discovered later if at all. A tool
correctly named for what it does (`--accept-data-loss`) should not be the one
guarding production data.

### Alternative B — Keep `db push`, add a `prisma migrate diff` check in CI

Run `prisma migrate diff --from-migrations ... --to-schema-datamodel ...` in
CI and fail the build if the migrations directory and `schema.prisma` have
drifted, without changing what the production container does at boot.
Rejected as weaker than Alternative A's replacement: it would have caught the
`note` drift, but it still leaves `db push --accept-data-loss` as the thing
that mutates the production database on every deploy. Detecting drift is not
the same as removing the mechanism that makes drift dangerous.

## Consequences

### Positive

- Migrations become load-bearing: what ships to production is the exact SQL
  reviewed in the PR, not a live diff computed at boot.
- A malformed or destructive migration fails `prisma migrate deploy` and
  halts the deploy, instead of silently reshaping the database and starting
  the app anyway.
- The migrations directory has to stay truthful, because production now
  depends on it — it can no longer drift unnoticed the way `note` did.

### Negative

- Every schema change now requires an explicit `pnpm prisma:migrate` step
  before it can ship; forgetting it fails the deploy instead of "just
  working" the way `db push` did.
- `prisma migrate deploy` will refuse to run if the migrations history and
  the live database's `_prisma_migrations` table disagree (e.g. a
  hand-edited production DB) — a recovery step (`prisma migrate resolve`)
  may be needed once, when this is first adopted.
- **Production has no migration history at all**, so this is not the one-line
  Dockerfile edit the follow-up below implies. `prisma db push` never creates
  `_prisma_migrations` (verified: pushing this schema into an empty database
  yields 19 tables and no such table), and `db push` is the only thing that has
  ever touched the production database. The first `prisma migrate deploy` there
  will therefore see a populated schema with no history and abort with **P3005 —
  "The database schema is not empty"**, before running any SQL. Production must
  be baselined first: `prisma migrate resolve --applied <name>` for **all seven**
  migrations in `packages/db/prisma/migrations/`, oldest first. The oldest,
  `20260507164251_add_client_project_sort_order`, is a squashed init that issues
  17 `CREATE TABLE`s — replaying it against live data would fail even if P3005
  did not stop it first.

### Neutral

- As of Task 8's Step 3a, `packages/db/prisma/migrations/` is truthful again
  relative to `schema.prisma`. This ADR is only viable because that gap was
  closed first — proposing `migrate deploy` against a drifted migrations
  directory would have failed the very first deploy.

## Follow-ups

- [ ] **First**, baseline production: run `prisma migrate resolve --applied` once
      per migration, oldest first, against the production database. Without this
      the next step aborts with P3005 on the first deploy. See the second Negative
      consequence above.
- [ ] Change `docker/web.Dockerfile:40` to run
      `prisma migrate deploy` instead of `db push --skip-generate --accept-data-loss`.
- [ ] Decide whether `.github/workflows/ci.yml:95` should switch to
      `migrate deploy` too (to catch a missing/broken migration before it
      reaches production), or intentionally keep `db push` in CI so the e2e
      Postgres always matches the schema even mid-development.
