# AIAGE-51 — Time Tracker fixes (US-90…US-99)

Status: approved 2026-07-08.

Four reported problems, plus four adjacent bugs found while investigating them and
explicitly folded in. Five workstreams, ten new user stories. `TOTAL_US` 89 → 99.

Nothing here needs new data capture. The database already holds everything the
user asked to see; in three of the four reported cases the fix is to render, scope,
or position data that already exists.

## What was reported, and what it actually is

| Reported (cs)                                                                                           | Actual defect                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "dej si do plánu sekundy v trackeru (ale jen u běžícího času)"                                          | `apps/web` already renders the running timer as `HH:MM:SS` on a 1 s tick. The **extension** dropped seconds in AIAGE-28. Scoped partial revert.                                                                                                                               |
| "přidej možnost obnovit smazaný záznam, případně rozšiř audit log, aby bylo vidět, co konkrétně smazal" | `restoreEntry` and `/trash` both exist, but restore is **admin-only** while delete is **owner-or-admin**. A member can delete their own entry and never get it back. Trash rows omit times/duration, so an entry with an empty description is unidentifiable.                 |
| "Když jsem scrollnutý níž a rozkliknu nějakou položku … dole vidím jen description a nevidím title"     | Extension only. `EntrySheet` is `absolute inset-0` inside `AppShell`'s `relative` root, which is **document-tall, not viewport-tall**. The sheet therefore spans the whole document and its header renders above the fold.                                                    |
| "tady vidím max 4 klienty, ale je jich více, přidej tam scroll"                                         | `/reports` → "Klienti". No `take: 4` in any query. `MultiSelect`'s popover is `absolute`; the ancestor `Card` is `overflow-hidden`, so the dropdown is clipped at the Card's bottom edge and its own `max-h-[16rem] overflow-y-auto` scroller never gets to show a scrollbar. |

Explicitly **out of scope** (considered and declined): rendering the audit log's
`before`/`after` snapshots in the UI. Those columns are fetched by `AuditRowDto`
and discarded by `audit/page.tsx`; surfacing them was offered and rejected in
favour of the trash-side fixes.

## Adjacent bugs folded in

Found during investigation, none reported, all confirmed against the code:

1. **`purgeOldDeleted()` is never called in production.** No `node-cron` import
   exists anywhere despite the dependency being declared (`apps/web/package.json:35`).
   `data-model.md:84` documents a daily job that does not exist. The trash page's
   copy "Po 30 dnech se trvale promazávají" (`trash/page.tsx:18`) is currently false
   and the trash grows without bound. Directly relevant: we are about to show
   `/trash` to every member.
2. **`NewProjectSheet.tsx:36` has EntrySheet's exact scroll bug** (`absolute inset-0`).
3. **US-46's "purge permanently" was never built.** `TrashList` renders only _Obnovit_.
4. **`audit/page.tsx:21` `ALL_ACTIONS` has drifted from the Prisma enum** — it omits
   `reorder` and `shift`, both of which are actively written (`catalog.ts:173`,
   `auto-stack-save.ts:238`). Those rows appear in the unfiltered table but cannot
   be filtered for.

## Workstream A — extension running timer shows seconds (US-90)

A scoped partial revert of AIAGE-28, which removed seconds from the extension
everywhere and widened the tick to 30 s.

- `apps/extension/src/popup.tsx:998` — render the running row with the shared
  `formatDurationHMS`, already tested at `packages/shared/src/time/time.test.ts:27`.
  Do not add a sixth formatter — the repo already has five (`formatDurationHMS`,
  `fmtDur`, `fmtDurationHM`, `fmtHM`, and `report-pdf.ts`'s private `hm`).

  **Import it from a leaf module, not the barrel.** `@tt/shared` and `@tt/ui` are
  both declared-but-unused in the extension today (`apps/extension/package.json:18-19`),
  so this is the first real consumer and the bundling path is unproven. The barrel
  (`packages/shared/src/index.ts`) re-exports `validators` (pulls **zod**) and `ws`
  (pulls the WS client), and even the `./time` subpath imports `date-fns-tz` at module
  scope — none of which belongs in an MV3 popup bundle. But `pad2` and `formatDurationHMS`
  (`time/index.ts:84-92`) are pure arithmetic that merely happens to be co-located with
  date-fns code. (`durationMs` at `:80` stays put — it calls the overridable `now()`.)

  Therefore: extract those two into a new leaf `packages/shared/src/time/duration.ts`
  with **zero imports**, re-export them from `time/index.ts` (so the barrel is unchanged
  and nothing breaks), and add `"./time/duration": "./src/time/duration.ts"` to
  `packages/shared/package.json` `exports`. The extension imports
  `@tt/shared/time/duration`. A bare re-export suffices: `pad2`'s only caller inside
  `index.ts` was `formatDurationHMS`, and both move together. This also lays the
  groundwork for eventually collapsing the five formatters.

  Because the extension's Vite build has never resolved a workspace package, commit 1
  (the e2e harness) lands first and will catch a bundling regression before the
  behaviour change rides on it.

- `apps/extension/src/popup.tsx:357-361` — the interval currently runs
  unconditionally at `30_000 ms`, even with no timer running. Gate it on
  `hasRunning` and export `RUNNING_TICK_MS = 1000`, mirroring
  `apps/web/src/app/(authenticated)/timer/TimerLists.tsx:59-67`.
- History rows, day-group totals and summary cards keep `fmtDurationHM`.
- `apps/extension/src/format.ts:1` — the comment asserts "seconds intentionally
  omitted — see AIAGE-28", which becomes false for the running case. Update it.

**`EntrySheet`'s "Odpracováno" (`EntrySheet.tsx:283`) deliberately stays on `HH:MM`.**
It computes `workedMs` once at render with no tick, so a frozen `00:12:37` reads as
more wrong than `00:12`.

**Layout risk.** `HH:MM:SS` is three characters wider inside a 380 px popup where
AIAGE-29 deliberately made STOP fill the row. Use `font-mono tabular-nums` and
verify the running row does not wrap.

## Workstream B — trash, restore, undo, purge (US-91…US-96)

| Change                   | File                   | Detail                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restore → owner-or-admin | `time-entries.ts:331`  | Replace `!role \|\| role !== 'admin'` with `softDeleteEntry`'s check (`:302`) verbatim: `!role → not_found`, then `entry.userId !== actorUserId && role !== 'admin' → not_found`                                                                                    |
| `listTrash` scoping      | `time-entries.ts:362`  | admin → whole company; member → `userId: actorUserId`; `!role` → `not_found`                                                                                                                                                                                        |
| `listTrash` payload      | same                   | Return `startedAt`, `endedAt`, `description`, user/client/project names. It currently returns only `id/userId/deletedAt`, which is why the page bypasses it                                                                                                         |
| Page uses the service    | `trash/page.tsx:8-13`  | `requireActiveCompany()` + `listTrash()`, replacing `requireAdmin()` + a direct `prisma()` query. Scoping belongs in the service layer                                                                                                                              |
| Nav un-gated             | `nav.ts:38`            | Drop `admin: true` from Koš                                                                                                                                                                                                                                         |
| Enriched rows            | `TrashList.tsx`        | Add Začátek / Konec / Trvání                                                                                                                                                                                                                                        |
| Undo                     | `TimerHistory.tsx:102` | On delete success render an `@tt/ui` `Alert` + "Vrátit zpět" above the list, auto-dismiss after 10 s, calling `restoreEntryAction`                                                                                                                                  |
| Purge                    | new `purgeEntry()`     | Admin-only, hard delete, exactly one `purge` audit row, behind the existing `useConfirm`                                                                                                                                                                            |
| Cron                     | new `/api/cron/purge`  | `POST`, `Authorization: Bearer ${CRON_SECRET}` compared with `crypto.timingSafeEqual`, 401 on missing/mismatched. Returns `{ purged: n }`. Driven by a daily Coolify scheduled task (`curl -fsS -XPOST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/purge`) |

A member will now see a "Koš" nav item that only ever contains their own deletions.
This is intended.

**`/api/cron/purge` returns 401, not 404.** Constitution §3's "404 never 403" rule
exists to prevent _cross-company existence leaks_. The cron endpoint serves no
company-scoped data and leaks nothing by admitting it exists, so the conventional
401 applies. This is the one place in the codebase where an auth failure is not a 404,
and the reasoning belongs in ADR-0011.

**Undo uses the existing `Alert` primitive, not a new Toast.** There is no toast
anywhere in the repo (no `sonner`, no snackbar, nothing in `packages/ui`). An
inline `Alert` above `TimerHistory` matches how `TrashList` already surfaces
errors, needs no portal, and is directly Playwright-testable. A real `Toast`
primitive can come later, when a second consumer exists.

**The cron writes one audit row per purged entry.** Constitution §3 requires every
mutation to produce exactly one audit row; `purgeOldDeleted` currently does a bare
`deleteMany` with none. Purge is the only irreversible operation in the system, and
the audit row's `before` snapshot becomes the entry's **sole surviving trace**. So
`purgeOldDeleted` becomes, inside one transaction: `findMany` (with `tags`) →
`createMany` audit rows (`action: 'purge'`, `actorUserId: null`, snapshot in
`before`, `after: null`) → `deleteMany`. This is a deliberate reading of §3 as
covering system-initiated mutations, and was approved as such.

### Error handling

- Undo after the 10 s window: the Alert is gone; `/trash` is the recovery path.
- Undo on an entry purged in between: `restoreEntry` returns `not_found` → error Alert.
- Concurrent purge and restore: both gate on `deletedAt`'s state, so one loses cleanly.
- Two concurrent cron runs: the transaction plus the `deletedAt < cutoff` filter
  makes the job idempotent.
- Restoring an entry whose client or project was archived: `archived` is a boolean,
  the FK still resolves, the entry restores intact. A _hard-deleted_ client is also
  safe — `TimeEntry.client` and `.project` are `onDelete: SetNull`
  (`schema.prisma:198-199`), so the entry survives with a null `clientId`.
- Purging an entry with tags needs no manual cleanup: `TimeEntryTag.timeEntry` is
  `onDelete: Cascade` (`schema.prisma:213`), so both `purgeEntry`'s `delete` and the
  cron's `deleteMany` drop the join rows. Snapshot the tags into `before` _first_,
  though — after the cascade they are unrecoverable.

## Workstream C — extension sheets pin to the viewport (US-97)

`AppShell`'s root (`popup.tsx:439`) is `relative` and grows to the full document
height. `absolute inset-0` therefore stretches a sheet from document `y=0` to the
bottom of the entire history list, not across the popup viewport. `AutoStackSheet.tsx:79`
already gets this right with `fixed inset-0`.

- `EntrySheet.tsx:137` and `NewProjectSheet.tsx:36`: `absolute inset-0 z-20` → `fixed inset-0 z-40`.
- Inner scroller (`EntrySheet.tsx:151`, `NewProjectSheet.tsx:48`): `overflow-y-auto` →
  `flex-1 min-h-0 overflow-y-auto`. Today it has no height constraint because its flex
  parent is document-tall, so it never actually scrolls — the document does.
- Lock body scroll while a sheet is open (`document.body.style.overflow = 'hidden'` in
  an effect, restored on unmount), so the history list behind the sheet does not scroll
  under it.

Scroll position is preserved on close, returning the user where they were.

## Workstream D — MultiSelect popover escapes clipping ancestors (US-98)

Portal the popover to `document.body` with `position: fixed`, anchored off the
trigger's `getBoundingClientRect()`, flipping up near the viewport bottom and
repositioning on scroll and resize.

This is the only fix that clears **both** clipping ancestors:

- `packages/ui/src/card.tsx:9` — `Card` is `overflow-hidden` (`/reports` filters)
- `packages/ui/src/confirm-modal.tsx:61` — `max-h-[90vh] overflow-y-auto` (`ExportDialog`)

Dropping `overflow-hidden` from `Card` is rejected: it is a shared primitive that
relies on the clip for rounded corners on tables, and it would not fix the modal
case at all, whose container _must_ scroll.

**The portal breaks the click-outside handler.** `MultiSelect.tsx:53` tests
`containerRef.current.contains(e.target)`; a portaled popover is no longer a DOM
descendant, so every click on an option would close it. Add a `popoverRef` and check
both.

The trigger's four-chip cap (`MultiSelect.tsx:111`, with a `+N` overflow badge at
`:131`) is deliberate and is **not** the reported bug. It stays.

Five call sites benefit: four in `ReportFiltersForm.tsx` (`:171`, `:179`, `:188`, `:229`)
and one in `ExportDialog.tsx:159`.

## Workstream E — audit filter pinned to the enum (US-99)

`audit/page.tsx:21` hand-maintains a copy of `AuditAction` that has already drifted.
Export `ALL_ACTIONS` and pin it in a test against the Prisma enum so drift cannot
recur. `purge` (Workstream B) lands in it automatically.

## Schema

One migration: `ALTER TYPE "AuditAction" ADD VALUE 'purge'`.

Postgres 16 permits this inside a transaction provided the new value is not _used_
in the same transaction. Prisma's generated migration satisfies that, but it is a
classic trap and gets a `docs/gotchas.md` entry.

`TimeEntry` already carries `deletedAt` (`schema.prisma:193`) with soft-delete-aware
indexes. No other schema change.

## Testing

Real Postgres and Redis via testcontainers, zero DB mocks. One user story per `it`,
US ID embedded in the name. Cross-company `not_found` for every changed read
(`listTrash`) and every mutation (`restoreEntry`, `purgeEntry`).

`apps/extension` has **no component-test harness today** — vitest only, over pure-logic
files, no RTL, and a `test:e2e` script (`package.json:14`) with no Playwright config
behind it. Workstream A and C are extension changes, and a CSS `absolute`→`fixed` fix
cannot be meaningfully unit-tested. So we stand the harness up.

**Harness shape.** `popup.html` is a plain Vite entry (`vite.config.ts` `rollupOptions.input`),
and the `chrome.*` surface is small: `storage.local` (11 uses), `storage.onChanged` (2),
`tabs.create` (2), `runtime.sendMessage` (1). Therefore the harness needs neither an
unpacked-extension load nor a running web app:

- serve `popup.html` via `vite preview`
- stub `chrome.*` with `page.addInitScript`
- stub the API with `page.route`
- viewport `380×600`

Real Chromium and real Tailwind, so `boundingBox()` geometry assertions are meaningful.

| US             | Where                                                                | Assertion                                                                                              |
| -------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 90             | `apps/extension/tests/e2e/popup.spec.ts`                             | Running row matches `/^\d{2}:\d{2}:\d{2}$/` and changes within 2 s; a history row stays `HH:MM`        |
| 91, 92, 93, 95 | new `apps/web/tests/services/trash.test.ts`                          | Owner restore; per-role scoping; enriched payload; purge. Cross-company `not_found` per mutation       |
| 94             | `apps/web/tests/e2e/trash-undo.spec.ts`                              | Delete → "Vrátit zpět" → row returns                                                                   |
| 96             | `trash.test.ts` + `apps/web/tests/services/cron-purge-route.test.ts` | >30 d purged, ≤30 d kept, one `purge` audit row each; missing/bad secret → 401                         |
| 97             | `apps/extension/tests/e2e/popup.spec.ts`                             | Scroll to bottom, click a row, assert the `Upravit záznam` header's `boundingBox().y >= 0`             |
| 98             | `apps/web/tests/e2e/reports-multiselect.spec.ts`                     | Popover is portalled to `<body>` and `position: fixed`; its option list scrolls; last option reachable |
| 99             | `apps/web/tests/services/audit.test.ts`                              | `new Set(ALL_ACTIONS)` equals `new Set(Object.values(AuditAction))`                                    |

Route-handler tests live in `apps/web/tests/services/*-route.test.ts` (see
`v1-timer-stop-route.test.ts`), not in a `tests/api/` directory — there isn't one.
`ALL_ACTIONS` therefore ships in a pure `audit/audit-actions.ts` module, because
importing `audit/page.tsx` from vitest would drag in `next/headers` via `@/lib/session`.

Also:

- Rename the existing untraced `it('purge cron deletes only entries soft-deleted >30 days ago')`
  (`time-entries.test.ts:470`) to carry `US-96`.
- Update `nav.test.ts` for the un-gated Koš.
- `apps/web/tests/e2e/time-entry-edit.spec.ts:45` asserts the literal string `"1h 0m"`.
  Workstream A does not touch `fmtDur`, so this stays green — but it is the tripwire
  if anyone later unifies the five duration formatters.

## Docs (constitution §6)

- **ADR-0011** — Coolify scheduled task for the purge job. Supersedes the `node-cron`
  sentence at `data-model.md:84` and drops the now-dead `node-cron` and
  `@types/node-cron` dependencies from `apps/web/package.json`.
- `docs/reference/env-vars.md` + `.env.example` — `CRON_SECRET`.
- `docs/reference/features.md` — US-90…US-99.
- `docs/reference/data-model.md` — `AuditAction` gains `purge`; correct the cron sentence.
- `scripts/test-trace.ts:10` — `TOTAL_US = 99`.
- `docs/gotchas.md` — two entries: the `ALTER TYPE … ADD VALUE` / Prisma-transaction trap,
  and `absolute inset-0` inside a document-tall `relative` root.
- `docs/reference/acceptance.md:27` — claims **every** US-19..28 test asserts the audit row
  count via `auditCount()`. Correct it. (This spec originally asserted the helper did not
  exist in `time-entries.test.ts` at all — that was wrong. It does, at `:63`, with a third
  distinct signature `(tx, entryId)`. The false part of the doc is "every": six of those
  tests assert no audit row. Verified during Task 10.)
- `apps/extension/src/DESCRIPTION.md` — record that e2e now exists.

## Commits

Ordering is load-bearing: 1 before 3–4 (the harness proves the bundle), 2 before 3
(the leaf module is what 3 imports), and 8 before 9 (the cron needs the `purge` enum
value).

1. `test(ext): Playwright e2e harness for the popup`
2. `refactor(shared): extract pure duration formatters into a leaf module`
3. `fix(ext): running timer shows seconds again, ticks every second (US-90)`
4. `fix(ext): entry + new-project sheets pin to the viewport (US-97)`
5. `fix(web): MultiSelect popover escapes clipping ancestors (US-98)`
6. `feat(trash): owners restore their own entries; trash scoped by role (US-91, US-92, US-93)`
7. `feat(timer): undo affordance after deleting an entry (US-94)`
8. `fix(db): add the missing time_entries.note migration` + `feat(trash): permanent purge + purge audit action (US-95, US-99)`
9. `feat(ops): daily purge endpoint + Coolify scheduled task (US-96)` — includes ADR-0011
10. `chore(ext): bump to 1.6.0` + `docs: record US-90…US-99, bump TOTAL_US` + ADR-0012 (propose `prisma migrate deploy`)

## Discovered during execution (amendments)

Two things the design did not know, both approved mid-run:

1. **Nothing applies `packages/db/prisma/migrations/`.** Production runs
   `prisma db push --skip-generate --accept-data-loss` on every container start
   (`docker/web.Dockerfile:40`); CI (`ci.yml:95`) and testcontainers
   (`packages/db/src/test/index.ts:40`) do the same. The directory had already drifted —
   `b4d9c98` added `TimeEntry.note` to the schema with no migration. Task 8 now repairs
   that drift in its own commit before generating the `purge` migration, because
   `prisma migrate dev` refuses to build cleanly on top of drift.
2. **`--accept-data-loss` on every production boot is a silent-data-loss hazard.** A field
   removed from `schema.prisma` would drop its column, and its data, at container start
   with no review step. Task 10 adds **ADR-0012** proposing a move to
   `prisma migrate deploy`, with `db push` confined to tests and local dev. The ADR is
   `Proposed`, not `Accepted`; `docker/web.Dockerfile` is not changed by this branch.

## User stories

- **US-90** — The extension's running row renders `HH:MM:SS` and updates every second;
  stopped rows, day totals and summary cards stay `HH:MM`.
- **US-91** — A non-admin owner restores their own soft-deleted entry, producing exactly
  one `restore` audit row. Another member's entry, or a cross-company entry, returns
  `not_found`.
- **US-92** — `/trash` is scoped by role: a member sees only their own deleted entries;
  an admin sees every member's in the active company; a non-member gets `not_found`.
- **US-93** — Trash rows expose start, end and duration, so an entry with no description
  is identifiable.
- **US-94** — After deleting an entry, an undo affordance restores it; letting it expire
  leaves the entry deleted.
- **US-95** — An admin purges an entry permanently from trash. The row is hard-deleted and
  exactly one `purge` audit row survives, carrying the `before` snapshot. Cross-company
  returns `not_found`.
- **US-96** — The daily purge endpoint hard-deletes entries soft-deleted more than 30 days
  ago, writing one `purge` audit row each; entries younger than 30 days are kept. A missing
  or incorrect `CRON_SECRET` returns 401.
- **US-97** — Opening an entry sheet in the extension while the popup is scrolled shows the
  sheet's header and `Název` field, because the sheet is pinned to the viewport.
- **US-98** — The `MultiSelect` popover renders above its clipping ancestors and scrolls
  when its options exceed its max height.
- **US-99** — The audit action filter offers every `AuditAction` value, pinned to the Prisma
  enum so it cannot drift.
