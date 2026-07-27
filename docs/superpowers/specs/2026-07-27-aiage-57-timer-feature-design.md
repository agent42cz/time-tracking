# AIAGE-57 — Timer Feature (US-102…US-104)

Status: approved 2026-07-27.

Three independent asks from one Plane item, delivered as three phases on one branch.
`TOTAL_US` 101 → 104, with US-16 and US-17 retired (phase 1 deletes the feature they
describe).

## What was reported, and what it actually is

| Reported (cs)                                                                                             | Actual work                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Odebrat štítky"                                                                                          | Full removal of the tag feature, down to dropping `tags` and `time_entry_tags`. Tags reach into services, actions, v1 API, MCP tools, both exports, the reports filter matrix, the extension and the seed. |
| "Přidat ke každému klientovi možnost nastavit barvu a pak v seznamu i v extension barevně název klienta"  | New `Client.color` with a fixed 10-colour palette, threaded through every surface that renders a client name — except the PDF export, which stays monochrome by explicit decision.                         |
| "stále máme bug, že ve více tabech chromu se neukončuje a nezapíná správně tasky, přidej tam nějaké logy" | `apps/web` has **no WebSocket client at all**. Two visible tabs never learn about each other. Diagnostics alone would only confirm this, so the fix ships with them.                                       |

## Root cause of the multi-tab bug

`grep -rln "WebSocket\|createWsClient" apps/web/src` returns nothing. The `/timer`
page refetches on exactly two triggers (`apps/web/src/app/(authenticated)/timer/TimerLists.tsx:92-122`):

1. the same-tab `tt:timer-changed` CustomEvent
2. `visibilitychange` → `visible`

The extension popup, by contrast, does hold a WS connection
(`apps/extension/src/sync.ts:157-199`). Consequences:

- Two **visible** tabs side by side (two windows, two monitors) never sync —
  `visibilitychange` does not fire when a window merely loses focus.
- Tab B holds stale `entry.id` values. Stop there targets an entry that is already
  stopped → 409 → `ApiError` → `executeStop` throws instead of enqueueing.
- Start in tab B creates a second running timer because tab B cannot see tab A's.
- Two Chrome profiles are two independent extension installs (separate
  `chrome.storage`, separate service worker) over one account.

That matches "in multiple tabs it doesn't stop and doesn't start tasks correctly".

---

## Phase 1 — remove tags

Complete removal including the database. Tag data is not preserved; this was an
explicit decision.

### Data layer

- Migration: `DROP TABLE time_entry_tags; DROP TABLE tags;`
- `packages/db/prisma/schema.prisma` — delete `model Tag` (176-188) and
  `model TimeEntryTag` (216-226); drop `Company.tags` (91) and `TimeEntry.tags` (208).
- `packages/db/src/seed.ts` — drop the three seed tags (100-105) and the three
  `tags: { create: … }` joins (121, 134, 148), plus `SEED_IDS.tagA1/tagA2/tagB1` (27-29).

### Services

- `apps/web/src/lib/services/catalog.ts` — delete `createTag`, `updateTag`,
  `deleteTag`, `listTags` (373-455) and the tag paragraph in the file header.
- `apps/web/src/lib/services/time-entries.ts` — remove `tagIds` from create (142),
  duplicate (226), update (296-301), `EntrySnapshot` (92, 105), `EntryWithTags` (70),
  and every `include: { tags: true }` (111, 448, 511, 617).
- `apps/web/src/lib/services/reports.ts` — remove `tagIds`/`tagsMode` filters (19-20,
  70-74), the `tags` include (84) and projection (103, 36), and the `tags` CSV column
  (205, 223).
- `apps/web/src/lib/services/report-pdf.ts` — drop the `tags` column: the label (38),
  the header cell (94) and the row cell (102).

### Actions and API

- `apps/web/src/lib/actions/catalog.ts` — `createTagAction`, `updateTagAction`,
  `deleteTagAction` (129-155) and their imports.
- `apps/web/src/lib/actions/time.ts` — `tagIds` from FormData (25, 60), the patch type
  (82, 93), the edit context (117, 122, 131, 144, 152, 163, 172) and duplicate (207, 217).
- `apps/web/src/app/api/v1/entries/route.ts` — `tagIds` (28, 53).
- `apps/web/src/app/api/v1/catalog/route.ts` — the `tags` query and response key (17, 19, 30, 43).
- `apps/web/src/app/api/reports/export.csv/route.ts` (17-18) and
  `export.pdf/route.ts` (65) — `sp.getAll('tag')` and `tagsMode`.

### MCP tools

`apps/web/src/server/mcp/tools/` — `start-timer.ts` (input schema 11, description 23,
call 36), `update-entry.ts`, `list-recent-entries.ts` (20, 51), `list-catalog.ts`.
This changes the public MCP tool surface; note it in `docs/operations/mcp-server.md`.

### Web UI

- Delete `apps/web/src/app/(authenticated)/tags/` (page + `TagsManager.tsx`).
- `nav.ts` — the `/tags` item (30), the `'tags'` `NavKey` (6), the route list entry (69);
  update `nav.test.ts` expectations (27, 53-56, 99).
- `components/nav-icons.tsx` — the `tags` icon.
- `reports/ReportFiltersForm.tsx` — the tag `MultiSelect` (230) and `tagsMode` toggle.
- `reports/ReportGrouped.tsx`, `reports/page.tsx` — tag columns/cells.
- `components/time/EditEntryDialog.tsx`, `timer/TimerStartCard.tsx`,
  `timer/RunningTimers.tsx`, `timer/TimerHistory.tsx` — tag pickers and chips.
- `lib/timer-events.ts` — `tags` from `TimerEntrySchema` (17-24).
- `lib/recent.ts` + test — any tag field.
- `messages/cs.json` — the `tags` block (218) and the `"tags": "Štítky"` labels (10, 47, 75, 149).

### Extension

- `apps/extension/src/api.ts` — `TagDto` (31), `tags` on catalog/entry DTOs (46, 59),
  `tagIds` on the three mutation inputs (335, 391, 414).
- `apps/extension/src/EntrySheet.tsx` — `tagIds` state (43, 62), `toggleTag` (91-92),
  submit payloads (117, 126), the chip row (268-278).
- `apps/extension/tests/e2e/fixtures.ts` — tag fixtures.

### Shared

- `packages/shared/src/validators/index.ts` — `tagIds` from the entry validator (42).
  `TagColorSchema` (33) is **kept and renamed** to `ClientColorSchema` for phase 2.
- `packages/shared/src/ws/index.ts` — `'tag.changed'` from `WsEventSchema`.
- `apps/ws` — any handler for that event type.

### US coverage gate

`scripts/test-trace.ts` requires every `US-1..US-TOTAL_US` to appear in a test file.
US-16 ("Admin manages a company-wide tag list") and US-17 ("User creates a new tag
inline") describe a feature that no longer exists, so their tests go and the gate
would fail.

Fix: add an explicit retired set to `scripts/test-trace.ts`, excluded from both the
denominator and the missing list:

```ts
/** Retired user stories — the feature they describe was removed. */
const RETIRED = new Set(['US-16', 'US-17']); // tags, removed in AIAGE-57
```

In `docs/reference/features.md`, keep US-16/US-17 in place marked
`— **retired in AIAGE-57**` (the list is positional; renumbering would invalidate
every other reference). Rename the section heading "Clients, projects, and tags" →
"Clients and projects". Reword the four stories that mention tags in passing without
changing their meaning: US-18 (drop "and tags"), US-20 (drop "/ tags"), US-41 (drop
"/ tag" from the filter matrix), US-97 (drop "cascading its tag joins").
Update `docs/reference/acceptance.md:16-17` the same way.

Audit rows already written with `entityType: 'tag'` stay — history is not rewritten.

---

## Phase 2 — client colour

### Data layer

```prisma
model Client {
  // …
  color String @default("#6b7280")
}
```

Migration adds the column with the default, so every existing client renders exactly
as it does today until someone picks a colour. Grey is a deliberate "unset" signal,
not a palette entry.

### Palette

Ten fixed colours in `packages/shared`, reusing the renamed `ClientColorSchema` for
validation. Values are chosen to clear 4.5:1 contrast against both the light and the
dark app background, because the colour is applied to **text** (the client name), not
just a swatch. The swatch picker component is lifted out of `TagsManager.tsx` before
that file is deleted in phase 1 — same interaction, new owner.

### Threading the value through

Read sites that must start selecting `color`:

- `lib/services/catalog.ts` (client list), `lib/services/reports.ts` (96, 103),
  `lib/services/dashboard.ts` (142, 382), `lib/actions/time.ts` (144).
- `/api/v1/timer/route.ts` — add `clientColor` alongside `clientName` (86, 100).
- `/api/v1/catalog/route.ts` — add `color` to each client.
- `lib/timer-events.ts` — `clientColor` on `TimerEntrySchema`.

Write site: a `updateClient` colour patch in `lib/services/catalog.ts` +
`lib/actions/catalog.ts`, admin-only, one audit row, cross-company `not_found`.

### Render sites

| File                                                       | Line        |
| ---------------------------------------------------------- | ----------- |
| `clients/ClientRow.tsx` (+ picker in `ClientsManager.tsx`) | new         |
| `timer/RunningTimers.tsx`                                  | 118         |
| `timer/TimerHistory.tsx`                                   | 129         |
| `reports/ReportGrouped.tsx`                                | 37, 74, 122 |
| `dashboard/ClientFundsCard.tsx`                            | 95          |
| `dashboard/page.tsx`                                       | 155         |
| `trash/TrashList.tsx`                                      | 107, 147    |
| extension `popup.tsx` entry rows + `EntrySheet.tsx`        | new         |

**Not** applied in `lib/services/report-pdf.ts` — the PDF export stays monochrome by
explicit decision. The CSV export is plain text and unaffected.

---

## Phase 3 — cross-tab sync and diagnostics

Both halves ship together: the fix removes the defect, the diagnostics prove it and
catch the next one.

### Fix — put the web app on the WebSocket

`packages/shared/src/ws/client.ts` exports `createWsClient`, but **nothing imports it** —
`grep -rn "createWsClient" apps packages` matches only its own definition and re-export.
The extension hand-rolls a raw `WebSocket` with its own backoff loop instead
(`apps/extension/src/sync.ts:157-199`). So the shared client is written, unused, and
untested in production.

The web app is what finally uses it:

- A `useTimerSync` hook in `apps/web/src/lib/` built on `createWsClient`, subscribing to
  `time_entry.*` and `timer.*` on the user channel and calling the existing `refetch` in
  `TimerLists.tsx`.
- Because `createWsClient` has no production mileage, its reconnect/backoff behaviour
  gets unit tests as part of this phase rather than being trusted on sight.
- Migrating the extension off its hand-rolled socket onto the same client is **out of
  scope** — it works today, and touching it while phase 3 is also changing stop/start
  behaviour would muddy the diagnostics. Worth a follow-up task.
- Keep `visibilitychange` and `tt:timer-changed` as fallbacks for a dead socket.
- Re-fetch immediately before a Stop/Start mutation so the action is taken against
  fresh ids, and treat a 409 on Stop as "already stopped elsewhere" — refresh and
  show a neutral notice instead of throwing.

### Diagnostics — persistent ring buffer

The popup unmounts every time it closes, so DevTools console output is lost; and
`local/no-console-in-src` is an `error` for all `apps/**` and `packages/**` TS.
Therefore diagnostics are persisted, not printed.

- New `apps/extension/src/diag.ts`: a ring buffer capped at ~300 records in
  `chrome.storage.local` under `tt:diag`, each record
  `{ ts, surface, instance, event, data }`.
  - `surface`: `'popup' | 'sw' | 'web'`
  - `instance`: a UUID per popup mount, and a persisted one per service-worker start —
    this is what distinguishes windows and Chrome profiles from each other.
- Instrumented events: popup mount, session load, refresh (with the resulting running
  entry ids), start/stop click → outcome, queue enqueue/collapse/flush,
  WS open/close/message, service-worker poll result, `storage.onChanged`.
- `apps/extension/public/background.js` writes to the same buffer. It is `.js` and
  outside `src`, so the lint rule does not reach it, but it uses `diag` for
  consistency rather than `console`.
- The popup gets a "Zkopírovat diagnostiku" control that copies the buffer as JSON.

### Diagnostics — server timeline

`apps/web/src/lib/diag-log.ts` emits one JSON line per timer mutation via
`process.stdout.write` (not `console`, matching `scripts/test-trace.ts`), gated behind
`TT_DIAG=1` so production is quiet by default. Fields: actor, entry id, source
(extension token vs. web session), action, outcome.

This is the piece that actually solves correlation: every surface and every Chrome
profile hits the same server, so the Coolify log holds one ordered timeline across all
of them. Per-client buffers cannot produce that.

Record `TT_DIAG` in `docs/reference/env-vars.md`.

---

## New user stories

- **US-102** — Admin picks a client colour from a fixed palette; the client's name
  renders in that colour in the timer lists, reports, dashboard, trash and the
  extension. Clients created before the feature keep the neutral grey default. The PDF
  export stays monochrome. Non-admins cannot set a colour; cross-company returns
  `not_found`; the update writes exactly one audit row.
- **US-103** — `/timer` reflects a start or stop performed elsewhere (another tab,
  another window, the extension) without a focus change, over the WebSocket. Stopping
  an entry another surface already stopped refreshes the list and reports it neutrally
  instead of erroring.
- **US-104** — The extension popup and service worker append diagnostic records to a
  capped `chrome.storage.local` ring buffer, tagged with a per-instance id, and the
  popup exports them as JSON. The buffer never grows past its cap.

`TOTAL_US` 101 → 104; `RETIRED` holds US-16 and US-17, so the gate demands 102 covered
stories.

## Testing

Per the constitution: real Postgres + Redis via testcontainers, one user story per
`it`, US id in the test name, cross-company 404 on every read and mutation, and
`auditCount()` on every mutation.

- **Phase 1** — existing tag tests are deleted, not skipped. `catalog.test.ts`,
  `time-entries.test.ts`, `reports*.test.ts`, `trash.test.ts`, `list-catalog.test.ts`
  and the entry-edit-context test lose their tag assertions. `nav.test.ts` expectations
  updated. A migration test asserts the tables are gone.
- **Phase 2** — service tests for the colour patch (admin-only, audit row,
  cross-company `not_found`, palette validation rejects an off-palette value); a
  Playwright test for the `/clients` picker and for the colour appearing in the timer
  list.
- **Phase 3** — unit tests for the ring buffer (cap enforcement, ordering, per-instance
  tagging) with `InMemoryStorageAdapter`; a service/API test that a Stop against an
  already-stopped entry is reported rather than thrown; a Playwright test with two
  browser contexts asserting tab B updates after tab A stops a timer.

## Documentation

After merge: `docs/architecture/` (WS now covers the web app; tags gone),
`docs/reference/data-model.md` (drop `Tag`/`TimeEntryTag`, add `Client.color`),
`docs/reference/features.md` and `acceptance.md` (retirements + US-102…US-104),
`docs/reference/env-vars.md` (`TT_DIAG`), `docs/operations/mcp-server.md` (tool surface
change). An ADR is not needed — no locked-stack decision changes; the web app adopting
the existing WS client is an application of ADR-era architecture, not a departure from it.
