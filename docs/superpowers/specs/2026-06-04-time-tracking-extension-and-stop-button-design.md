# Design — AIAGE-25 "Time Tracking": extension improvements + dashboard Stop-button fix

- **Status:** Approved (design), pending implementation plan
- **Date:** 2026-06-04
- **Plane:** AIAGE-25 (parent) + subtasks AIAGE-26, 28, 29, 30, 31, 34
- **Areas:** `apps/extension` (5 items), `apps/web` (1 bug), plus thin new `apps/web/src/app/api/v1` surface

## Overview

AIAGE-25 bundles six small-to-medium items: five improvements to the Chrome
extension popup and one bug fix in the web dashboard. The key enabler is that
the backend **business logic already exists and is tested** —
`createManualEntry`, `updateEntry` (`apps/web/src/lib/services/time-entries.ts`)
and `createProject` (`apps/web/src/lib/services/catalog.ts`). So the extension
features reduce to: a thin v1 REST endpoint per service, extension UI, and
offline-queue wiring (the queue already declares the needed mutation types).

Decisions taken during brainstorming:

1. **Seconds (28):** hide seconds **everywhere** in the extension — live timer
   and history both show `HH:MM`.
2. **Edit/manual UI (26/34):** an **overlay sheet** that slides over the popup,
   shared by both flows.
3. **Create project (30):** **under an existing client, admin-only** — matches
   the current `requireAdmin` authorization with no authz changes.

Non-goal / assumption: the extension has **no `next-intl`**; it uses hardcoded
Czech strings. New strings follow that existing convention. Introducing i18n to
the extension is out of scope (would be its own task + ADR).

## Subtasks

### AIAGE-31 — Web dashboard Stop button is broken (bug)

**File:** `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx:146-154`

**Root cause:** the Stop button was given the icon-only square sizing
`className="h-10 w-10 sm:h-8 sm:w-8"` — identical to the `✎` `EditEntryButton`
on the line above (`:144`) — during commit `e3b4a8b` ("refactor(responsive):
dedup table→card sites, auth shell, and row actions"). But the Stop button
still renders the **text** `■ Stop`. The shared `Button`
(`packages/ui/src/button.tsx`) applies `whitespace-nowrap` + `px-3` (from
`size="sm"`), so the label cannot fit a 32px (`sm:w-8`) / 40px (`w-10`) square
box and overflows/clips. This is why the ticket was filed 2026-06-04 even though
the Jun-3 `gap` fix (`aa162f6`) is already in `HEAD` — that fix addressed row
spacing, not this button.

The click handler (`handleStop`, `:71-107`) is correctly bound and works; the
defect is purely visual.

**Fix:** drop the fixed width, keep the height for tap-target parity with the
edit button → `className="h-10 sm:h-8"`. The label then sizes naturally via
`size="sm"` (`h-8 px-3`). The button container is already `w-full sm:w-auto`
(`:131`), so on mobile the button can stretch; on desktop it hugs its label.

**Tests:** the existing `apps/web/tests/e2e/time-entry-edit.spec.ts` already
clicks `getByRole('button', { name: '■ Stop' })`. Add a lightweight regression
guard that the Stop button is rendered with its full accessible label and is
not constrained to the icon-only square width (assert the className no longer
contains `w-8`/`w-10`, or assert a minimum rendered width in Playwright).

### AIAGE-29 — Bigger STOP button (extension)

**File:** `apps/extension/src/popup.tsx:892-898` (`RunningList`)

Current button: `rounded bg-red-600 px-2 py-1 text-[10px] font-semibold`.

**Change:** make Stop the dominant control in the running row — bump to roughly
`rounded-md px-4 py-2 text-sm font-semibold`, and let it fill the available row
width when a timer is running. Pure styling; no logic change.

### AIAGE-28 — Remove seconds (extension), everywhere

**File:** `apps/extension/src/popup.tsx:342-348` (`fmtDuration`) and its call
sites: live running timer (`:889-890`), history rows (`:985-990`), summary cards.

**Change:** format durations as `HH:MM` (floored, drop the seconds field).
Either change `fmtDuration` to return `HH:MM` or add `fmtDurationHM` and switch
all extension call sites to it. Because the live timer then changes only once
per minute, widen the `setInterval` tick in `AppShell` (`:361-365`) from `1000`
ms to ~`20000` ms.

### AIAGE-26 — Edit entry in the extension (overlay sheet)

Clicking an entry opens an overlay sheet to edit `description`, `client`,
`project`, `start`, `end`, and `tags` — Clockify-style. Applies to history rows
and the running row (end is empty/disabled while running).

**Backend — new endpoint `PATCH /api/v1/entries/[id]`**
(`apps/web/src/app/api/v1/entries/[id]/route.ts`, add `PATCH` next to the
existing `DELETE`). Wraps `updateEntry(prisma(), session.userId, id, patch)`.

- Auth/scoping: `resolveApiSession` → 401; the service resolves the entry's own
  company and enforces owner-or-admin, returning `not_found` for any
  cross-company / non-member / non-owner case → map to **404** (existence-safe,
  per the constitution). Follows the `DELETE` handler's `!result.ok → 404`
  pattern.
- Body (all optional): `description`, `clientId` (`string|null`), `projectId`
  (`string|null`), `startedAt` (ISO), `endedAt` (ISO|null), `tagIds` (`string[]`).
- Validation: `updateEntry` returns `invalid_window` / `future_timestamp` →
  map to **422**.
- Audit: `updateEntry` already writes exactly one audit row and publishes
  `time_entry.updated`.

### AIAGE-34 — Manual time entry in the extension (overlay sheet)

A "Přidat ručně" button opens the **same** overlay sheet in create mode (start +
end both required).

**Backend — new endpoint `POST /api/v1/entries`**
(new `apps/web/src/app/api/v1/entries/route.ts`, collection route alongside the
existing `[id]` route). Wraps `createManualEntry(prisma(), session.userId, input)`.

- Auth/scoping: `resolveApiSession` → 401; `pickActiveCompany(session, ?company)`
  → 404 `no_company` when the user has no membership (mirrors `timer` POST).
- Body: `description?`, `clientId?`, `projectId?`, `startedAt` (ISO, required),
  `endedAt` (ISO, required), `tagIds?`. `companyId` comes from the active company.
- Validation: `invalid_window` / `future_timestamp` → **422**.
- Audit: `createManualEntry` already writes one audit row and publishes
  `time_entry.created`.

### AIAGE-30 — Create project from the extension (admin-only, existing client)

Inside the project `<select>` (in both the start row and the entry sheet), an
inline **"+ Nový projekt"** option — shown only when the active-company role is
admin **and** a client is selected. Choosing it reveals a small name input;
on submit, create the project, refresh the catalog, and select the new project.

**Backend — new endpoint `POST /api/v1/projects`**
(new `apps/web/src/app/api/v1/projects/route.ts`). Wraps
`createProject(prisma(), session.userId, { clientId, name })`.

- Auth/scoping: `resolveApiSession` → 401. `createProject` already calls
  `requireAdmin` on the client's company → non-admin / cross-company → map to
  **403/404** (404 for cross-company existence safety; 403 for known-but-not-admin).
- Body: `clientId` (required), `name` (required). Returns `{ id }`.
- **Audit gap to close:** `createProject` (`catalog.ts:184-195`) currently
  writes **no** audit row, violating the "every mutation → exactly one audit
  row" rule. Add an audit write (`action: 'create', entityType: 'Project'`)
  inside `createProject`, with a test asserting `auditCount()` increments by one.

**Role exposure:** add the active-company `role` (or a derived
`canCreateProjects` boolean) to the `/api/v1/catalog` response
(`apps/web/src/app/api/v1/catalog/route.ts`). `pickActiveCompany` already
returns `{ companyId, role }`, so this is a one-field addition. The extension
uses it to gate the "+ Nový projekt" affordance.

## Extension data layer

**`apps/extension/src/api.ts`** — add REST calls:

- `updateEntry(session, id, patch)` → `PATCH /api/v1/entries/{id}`
- `createManualEntry(session, companyId, input)` → `POST /api/v1/entries?company=…`
- `createProject(session, { clientId, name })` → `POST /api/v1/projects`
- extend the `CatalogResponse` type with `role` / `canCreateProjects`.

**`apps/extension/src/sync.ts`** — implement the `updateEntry` and `createManual`
cases that are currently dropped silently (`:290-293`): optimistic local update +
offline queueing + replay on reconnect, consistent with `startTimer`/`stopTimer`.

**`apps/extension/src/queue.ts`** — no change; mutation types `updateEntry` and
`createManual` already exist (`:20-21`).

## Extension UI

- **`EntrySheet`** — new absolute-positioned overlay component inside the 360px
  popup, with two modes (edit / create) over one form: description, client
  select, project select, start (date+time), end (date+time), tags. Save calls
  `updateEntry` or `createManualEntry`.
- Refactor the client/project selects out of `StartRow` (`popup.tsx:732-850`)
  into shared components reused by `StartRow` and `EntrySheet`.
- **Edit (26):** clicking a history row / running row opens `EntrySheet` in edit
  mode (currently rows only expose Play-again + Delete).
- **Manual (34):** a "Přidat ručně" trigger opens `EntrySheet` in create mode.
- **Create project (30):** inline "+ Nový projekt" within the project select,
  admin-gated via the catalog `role` flag.
- All new strings hardcoded in Czech, matching the extension's convention.

## Testing

- **Backend (vitest + testcontainers, real Postgres/Redis — no mocks):** for
  each new endpoint — happy path, **cross-company 404** (mandatory), validation
  (422), and **audit-count** assertions. New `createProject` audit covered.
  Test names embed the relevant US ID (e.g. edit maps to the existing US-54;
  confirm/assign US IDs for manual entry and project create).
- **Extension (vitest, `InMemoryStorageAdapter`):** `api.ts` new calls,
  `sync.ts` queue/replay for `updateEntry` + `createManual`, `fmtDuration`
  `HH:MM` output, and `EntrySheet` behavior.
- **Web (Playwright):** AIAGE-31 covered by `time-entry-edit.spec.ts` + a
  Stop-button width regression guard.
- **US coverage:** verify `pnpm test:trace` stays at 100% — add US entries in
  `docs/reference` if these features introduce new user stories.

## Sequencing

1. **AIAGE-31** — web Stop-button width fix (isolated, ship first).
2. **AIAGE-29 + AIAGE-28** — extension button size + `HH:MM` (pure frontend).
3. **Backend** — `createProject` audit; `PATCH /entries/[id]`, `POST /entries`,
   `POST /projects`; catalog `role` flag (each with tests).
4. **Extension data layer** — `api.ts` calls + `sync.ts` cases.
5. **Extension UI** — `EntrySheet` (edit + manual) + inline project create.

## Out of scope

- Introducing `next-intl` / i18n to the extension.
- Loosening project-creation authorization to non-admins (would need an ADR).
- Creating new clients from the extension (only existing-client project creation).
