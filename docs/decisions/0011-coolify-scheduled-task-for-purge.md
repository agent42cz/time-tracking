# 0011 — Coolify scheduled task for the trash purge

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Michal Lénert
- **Related:** AIAGE-51, US-96, [`0006-coolify-expose-not-ports.md`](0006-coolify-expose-not-ports.md)

## Context

`purgeOldDeleted()` has existed and been unit-tested since the trash feature
landed, but nothing ever called it. `node-cron` was a declared dependency of
`apps/web` with zero imports anywhere in the repo, and
`docs/reference/data-model.md` described "a daily `node-cron` job" that did not
exist. The trash grew without bound and the UI copy "Po 30 dnech se trvale
promazávají" was false.

AIAGE-51 exposes `/trash` to every member (US-92), so the retention promise now
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
idempotent (`deletedAt < cutoff`), so concurrent replicas would be harmless.

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
- The purge is not wrapped in a transaction, so a crash mid-run can leave
  `purge` audit rows for entries that still exist. The next run re-audits them.
  Duplicate audit rows were judged strictly better than losing the snapshot of
  an entry that is already gone.

### Neutral

- This is the only endpoint in the codebase whose auth failure is a 401.

## Follow-ups

- [ ] Register the scheduled task in Coolify: daily,
      `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/purge"`
- [ ] Set `CRON_SECRET` in the Coolify environment.
