# CLIENTS — clients & projects management UX

> Epic-level spec. Each task in this folder has its own `assignment.md` (what & why), `plan.md` (how, written via `superpowers:writing-plans`), and `changelog.md` (what shipped).

## What

Three new admin capabilities on `/clients` (Klienti a projekty):

- **US-51 — Search.** A search input above the list filters clients and projects together. Matching by client name keeps the client visible. Matching by project name keeps the parent client visible AND auto-expands it, with only matching projects rendered underneath. Diacritic- and case-insensitive ("agent" matches "Agént"). Pure client-side filter — no extra round-trip.
- **US-52 — Drag clients.** Admins drag active clients to set a canonical company-wide order. Order is persisted on `Client.sortOrder` and honored everywhere clients appear.
- **US-53 — Drag projects.** Admins drag active projects within a client to set a canonical order. Persisted on `Project.sortOrder` and honored everywhere projects appear.

Archived items are pinned to the bottom of every list and are not draggable. Search is suppressed during drag and drag is suppressed during search — letting users drag a filtered list would produce an order they didn't intend.

## Why

The existing `/clients` page lists items in alphabetical order with no way to filter. With even a handful of clients and projects, scanning the list to find one specific entry is slow. Beyond search, alphabetical ordering doesn't reflect how teams actually think about their work: most teams have a primary client and primary projects they want at the top of every picker. A canonical company-wide order matters more than alphabetisation everywhere a client/project list is rendered (timer dropdown, weekly report filter, extension picker, reports filters), so the order set on this page propagates system-wide.

## Acceptance criteria

- [ ] Searching for a substring matches against both client and project names; matches are diacritic- and case-insensitive.
- [ ] A client whose name matches the query stays visible with all its projects rendered.
- [ ] A client with at least one matching project is visible AND auto-expanded; only matching projects render under it.
- [ ] Clients with no client-name match and no project match are hidden.
- [ ] Clearing the search collapses auto-expanded clients back to the user's manual `openClient` state.
- [ ] `Esc` clears the search input.
- [ ] Active clients are drag-reorderable; archived clients are pinned to the bottom and don't show drag handles.
- [ ] Active projects within a client are drag-reorderable; archived projects pinned to the bottom and not draggable.
- [ ] Drop persists optimistically; on `{ ok: false }` the row reverts and the error renders in the existing `Alert` banner.
- [ ] Reorder writes exactly one audit row per drop (`action: 'reorder'`).
- [ ] Cross-company probes return 404, not 403 (no existence leak).
- [ ] Order set on `/clients` is honored in `apps/web/src/app/(authenticated)/timer/page.tsx`, `apps/web/src/app/api/v1/catalog/route.ts`, and any other Client/Project list reads — canonical sort tuple is `(archived asc, sortOrder asc, name asc)`.
- [ ] Drag is keyboard-accessible (tab to handle, Space to lift, ↑/↓ to move, Space to drop), with Czech `aria-live` announcements.
- [ ] Drag works on touch (iPhone viewport) — pointer activation 5px so taps on archive/delete buttons don't start drags.
- [ ] When a search query is active, drag handles are hidden and the Czech hint `Vyhledávání je aktivní – zrušte ho pro řazení.` renders.
- [ ] All Czech strings live in `apps/web/messages/cs.json` (no hardcoded strings in JSX).
- [ ] Playwright E2E suite covers search, reorder persistence, optimistic rollback, keyboard reorder, and touch reorder.
- [ ] `pnpm test:trace` reports US-51, US-52, US-53 as 100% covered.

## Sort tuple

The canonical Prisma `orderBy` for every Client and Project list:

```ts
orderBy: [{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }];
```

`name asc` is the deterministic tie-breaker for any rows that have not yet been reordered (or in the unlikely case two rows end up with the same `sortOrder` due to a write race).

## Architecture overview

```
packages/db                schema migration: sort_order on Client + Project, AuditAction.reorder
packages/ui                new SearchInput primitive (icon + clear button + Esc-to-clear)
apps/web/src/lib/services  catalog.ts gains reorderClients() / reorderProjects()
apps/web/src/lib/actions   catalog.ts gains the two server actions, revalidatePath('/clients')
apps/web/src/app/...       clients/{ClientsManager.tsx,ClientRow.tsx,ProjectRow.tsx,filterClients.ts}
                           timer/page.tsx + api/v1/catalog/route.ts switch to sortOrder ordering
apps/web/messages/cs.json  new Czech strings for search, dnd, audit action label
docs/decisions             new ADR for @dnd-kit dependency
```

## Sort-order persistence

- Integer `sortOrder` column on both `Client` and `Project`, full reindex 1..N on each drop.
- Same approach Linear, Notion, and pre-fractional Trello started with. Simple, correct, no fractional-key drift to debug.
- Audit: existing `AuditAction` enum gains a `reorder` value. `entityType` is `client_order` (entityId = companyId) or `project_order` (entityId = clientId). `before` and `after` JSON contain the ordered ID arrays.
- No `@@unique([companyId, sortOrder])` constraint — would cause transient collisions when two rows swap inside a transaction. Procedural uniqueness is sufficient.

## Backfill

The Prisma migration includes a data step that assigns `sort_order = row_number() over (partition by company_id order by name asc)` for clients and the equivalent partitioned by `client_id` for projects. Active and archived rows backfill together; archived rows still sort to the bottom because `archived asc` is the leading clause.

## Search wiring

`filterClients(clients, query)` is a pure helper returning `{ visible: Client[], autoExpanded: Set<string> }`:

- Normalisation: `s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()` on both query and names. Pure, fast, no dep.
- Empty query → all clients visible, none auto-expanded; manual expand state still honored.
- Match on client name → client visible with all its projects.
- Match on a project's name → parent client visible and `autoExpanded.has(c.id)` true; only matching projects render under it.
- The orchestrator (`ClientsManager.tsx`) merges `autoExpanded` with the user's manual `openClient` state: a client is rendered open if `autoExpanded.has(c.id) || openClient === c.id`.

## Drag wiring (`@dnd-kit`)

- `@dnd-kit/core` + `@dnd-kit/sortable` (~12 KB gz total) are added to `apps/web` via a new ADR.
- Outer `DndContext` wraps the active client list; inner `DndContext` per client wraps that client's active project list.
- Archived clients and archived projects render outside their respective `SortableContext` so they aren't draggable.
- `onDragEnd` calls `arrayMove` for the optimistic update, then fires the corresponding action; on `{ ok: false }` the array reverts and the error surfaces in the existing `Alert` banner.
- `PointerSensor` with `activationConstraint: { distance: 5 }`.
- `KeyboardSensor` with Czech `screenReaderInstructions` (loaded from `cs.json`).
- Drag is suppressed entirely while a search query is active.

## Decomposition into tasks

```
CLIENTS-01 (data plumbing) ─┐
                            ├─→ CLIENTS-04 (ADR + dnd + actions) ─┐
CLIENTS-02 (SearchInput) ───┘                                     ├─→ CLIENTS-05 (Playwright E2E)
                            ┌─→ CLIENTS-03 (search wiring) ───────┘
                            └── (uses CLIENTS-02)
```

| Task                                   | Summary                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [CLIENTS-01](CLIENTS-01/assignment.md) | Schema migration + audit enum + service layer + read-site sweep                                      |
| [CLIENTS-02](CLIENTS-02/assignment.md) | `SearchInput` primitive in `@tt/ui`                                                                  |
| [CLIENTS-03](CLIENTS-03/assignment.md) | Extract row components, add `filterClients` helper, wire `SearchInput` on `/clients`                 |
| [CLIENTS-04](CLIENTS-04/assignment.md) | ADR for `@dnd-kit`, install, optimistic drag-and-drop reorder UI for clients and projects            |
| [CLIENTS-05](CLIENTS-05/assignment.md) | Playwright E2E suite covering search, reorder persistence, rollback, keyboard reorder, touch reorder |

## Out of scope (this epic)

- **Per-user custom order.** All admins of a company see the same order. A future epic could layer per-user preferences on top, but the constitution and the data-model decision treat order as company-canonical.
- **Reordering tags or members.** Different surfaces, different epics.
- **Bulk reorder UI.** Drag is per-drop; there's no "save all" button or bulk-import-order flow.
- **Server-side search.** All filtering is client-side; no `?q=` URL param.

## Dependencies

- None outside the epic. CLIENTS-01 and CLIENTS-02 can run in parallel; CLIENTS-03 needs CLIENTS-02; CLIENTS-04 needs CLIENTS-01 + CLIENTS-03; CLIENTS-05 needs everything else done.
