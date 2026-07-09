# 0011 — Coolify scheduled task for the trash purge

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Michal Lénert
- **Related:** AIAGE-51, US-98, [`0006-coolify-expose-not-ports.md`](0006-coolify-expose-not-ports.md)

## Context

`purgeOldDeleted()` has existed and been unit-tested since the trash feature
landed, but nothing ever called it. `node-cron` was a declared dependency of
`apps/web` with zero imports anywhere in the repo, and
`docs/reference/data-model.md` described "a daily `node-cron` job" that did not
exist. The trash grew without bound and the UI copy "Po 30 dnech se trvale
promazávají" was false.

AIAGE-51 exposes `/trash` to every member (US-94), so the retention promise now
has to be real.

## Decision

Expose `POST /api/cron/purge`, guarded by a `CRON_SECRET` bearer token compared
with `crypto.timingSafeEqual`, and drive it from a **Coolify scheduled task**
running daily. Drop the unused `node-cron` dependency.

The endpoint returns **401** on an auth failure, not the 404 that the
constitution mandates elsewhere. That rule exists to prevent cross-company
existence leaks; this endpoint serves no company-scoped data and leaks nothing
by admitting it exists.

## Alternatives considered

### Alternative A — `node-cron` inside `apps/web/src/instrumentation.ts`

Matches the already-documented intent and the existing dependency. Needs a
`NEXT_RUNTIME === 'nodejs'` guard and an HMR double-register guard. The purge is
idempotent because `deletedAt < cutoff` is restated on the `deleteMany` itself,
so concurrent replicas would be harmless — at worst they duplicate `purge` audit
rows, never a delete.

Rejected because the job would be invisible: no run history, no logs surfaced
anywhere, and no way to trigger it by hand when investigating. It would have
become viable if we already had a job-observability story in-process.

### Alternative B — `node-cron` inside `apps/ws`

`apps/ws` is a single instance, so it would fire exactly once with no guards.

Rejected because `apps/ws` is Redis-only today and has no Prisma client. This
would pull the entire DB layer into a process that does not otherwise need it,
to schedule one daily query.

## Consequences

### Positive

- Run history, exit codes and logs are visible in Coolify's UI.
- The job can be triggered by hand during an incident with one `curl`.
- No in-process scheduler; no double-fire across replicas.
- `apps/web` sheds a dependency it never used.

### Negative

- One more secret to manage (`CRON_SECRET`). Unset ⇒ the endpoint is inert
  (rejects everything), which fails closed but silently.
- The route wraps the whole purge in one interactive transaction with a 30 s
  timeout, so a crash mid-run rolls back both the audit rows and the deletes.
  The audit rows go in via a single `createMany` rather than one insert per
  entry, because N sequential round-trips would exhaust that timeout.
- **The run is incremental: `purgeOldDeleted` bounds its SELECT with
  `take: PURGE_BATCH_SIZE` (5 000), oldest-deleted first.** Postgres caps a
  statement at 65 535 bind parameters. The single `createMany` binds ~8 columns
  per audit row and so blows first, at roughly 8 000 rows — well before the
  `deleteMany`'s one-parameter-per-id `in` list does. The first production run,
  which sees every entry ever soft-deleted, would therefore have failed hard.
  Chunking only the DELETE was rejected: it leaves `createMany` to hit the
  ceiling first, and that INSERT cannot itself be chunked without reintroducing
  the round-trip cost above. Bounding the SELECT bounds both writes at once.
  A backlog now drains at 5 000 entries per run in retention order; a response of
  `{ purged: 5000 }` means more is waiting, and the endpoint is idempotent, so an
  operator can `curl` it repeatedly to drain faster. The `id: { in: … }` clause
  stays on the DELETE so that _audited ⊇ deleted_ holds.
- The purge still audits _before_ deleting, so an entry a user restores while the
  run is in flight survives the `deletedAt < cutoff` DELETE but keeps a `purge`
  audit row it did not earn. An unearned audit row was judged strictly better
  than losing the snapshot of an entry that is already gone.

### Neutral

- This is the only endpoint in the codebase whose auth failure is a 401.

## Follow-ups

- [ ] Register the scheduled task in Coolify: daily,
      `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/purge"`
- [ ] Set `CRON_SECRET` in the Coolify environment.
