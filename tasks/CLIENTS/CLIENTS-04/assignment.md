# CLIENTS-04 — ADR + drag-and-drop reorder

## What

Add `@dnd-kit/core` + `@dnd-kit/sortable` as new dependencies (recorded in a new ADR), then wire optimistic drag-and-drop reorder for active clients and active projects on `/clients`. Drops fire the server actions added in [CLIENTS-01](../CLIENTS-01/assignment.md); the UI updates immediately and reverts to the prior order on error. Drag is suppressed entirely while a search query is active.

## Why

Alphabetical ordering doesn't match how teams actually think about their clients and projects. The drag interaction lets admins set a meaningful order once, on this page, and the sortOrder propagation from CLIENTS-01 makes that order the canonical company-wide order in every picker and filter.

`@dnd-kit` is the de-facto choice for React DnD: ~12 KB gz, accessible (keyboard reordering and `aria-live` announcements out of the box), good touch support, works cleanly with React 19. Adding it to the locked tech stack requires an ADR per the project constitution.

## Acceptance criteria

### ADR

- [ ] New ADR `docs/decisions/0007-dnd-kit-for-reordering.md` (or next free number) created from `_template.md`. Status: Accepted. Includes:
  - Context: why reordering is needed (link to CLIENTS epic README).
  - Decision: adopt `@dnd-kit/core` + `@dnd-kit/sortable` as the only DnD library in the codebase.
  - Alternatives considered: `react-beautiful-dnd` (unmaintained since 2022), native HTML5 drag (no touch / no keyboard accessibility).
  - Consequences: ~12 KB bundle cost on `/clients`, accessibility comes for free, keyboard reorder is a feature we ship rather than build.

### Dependency wiring

- [ ] `@dnd-kit/core` and `@dnd-kit/sortable` added to `apps/web/package.json` at the latest stable versions.
- [ ] `pnpm install` updates the lockfile; the lockfile is committed.

### UI behavior — clients

- [ ] Active clients in `ClientsManager.tsx` are wrapped in a `<DndContext>` + `<SortableContext items={activeClientIds} strategy={verticalListSortingStrategy}>`.
- [ ] Each `ClientRow` for an _active_ client has a drag handle (icon, `aria-label="Přetáhnout pro změnu pořadí"` from `cs.json`).
- [ ] Archived clients render outside the `SortableContext`, after a divider, with no drag handle.
- [ ] On `onDragEnd`:
  - Compute the new order via `arrayMove(activeClients, oldIndex, newIndex)`.
  - Apply optimistically to local state.
  - Call `reorderClientsAction(newActiveClientIds)`.
  - On `{ ok: false }`, revert local state to the pre-drop array and render the error in the existing `<Alert tone="danger">`.
- [ ] Drag handles are hidden and the Czech hint `Vyhledávání je aktivní – zrušte ho pro řazení.` (from `cs.json`) renders when `query.length > 0`.

### UI behavior — projects

- [ ] Active projects within each `ClientRow` are wrapped in their own `<DndContext>` + `<SortableContext>` (per-client, scoped to that client's project list).
- [ ] Archived projects render outside the `SortableContext` with no drag handle.
- [ ] `onDragEnd` calls `reorderProjectsAction(clientId, newActiveProjectIds)` with the same optimistic-then-revert pattern.

### Sensors & accessibility

- [ ] `PointerSensor` configured with `activationConstraint: { distance: 5 }` so a pointerdown on archive/delete buttons doesn't accidentally start a drag.
- [ ] `KeyboardSensor` enabled. Czech `screenReaderInstructions` provided (loaded from `cs.json` under `clients.dnd.instructions`).
- [ ] `aria-live` announcements default to dnd-kit's English; override with Czech equivalents in `cs.json` and pass via `accessibility.announcements` on `<DndContext>`.

### Localisation

- [ ] `apps/web/messages/cs.json` gains under `clients.dnd.*`: `dragHandle`, `instructions`, plus the `aria-live` announcement variants. The "search is active, clear it to reorder" hint already lives at `clients.search.disabledDrag` (added by [CLIENTS-03](../CLIENTS-03/assignment.md)) — drag-suppression UI consumes it from there.

### Tests

- [ ] No new dnd-kit interaction tests in this task — we don't mock dnd-kit's sensors. Drag _behavior_ is verified end-to-end by Playwright in [CLIENTS-05](../CLIENTS-05/assignment.md). The action contract and service contract are already tested at the unit/integration level by [CLIENTS-01](../CLIENTS-01/assignment.md).
- [ ] Existing tests (`ClientsManager` orchestration, `filterClients` pure helper) all still pass after the refactor.

### Verification

- [ ] `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web test && pnpm --filter @tt/web build` all green.
- [ ] Browser smoke (admin, on the `/clients` page): drag a client, drag a project, search, verify drag suppressed during search, error path via dev-tools network throttle to a 500.

## Out of scope

- Reordering archived items.
- Reordering tags or members.
- A "save order" button. Drops persist immediately.
- An undo button. Errors revert; successful drops are undone by dragging again.
- Modifying any other surface that lists clients or projects (timer, weekly report) — those already pick up the new order via CLIENTS-01's read-site sweep.
- Playwright E2E tests. That's [CLIENTS-05](../CLIENTS-05/assignment.md).

## Dependencies

- [CLIENTS-01](../CLIENTS-01/assignment.md) — server actions and service functions must exist.
- [CLIENTS-03](../CLIENTS-03/assignment.md) — row extraction (`ClientRow.tsx`, `ProjectRow.tsx`) must be in place; drag handles and sortable wrapping are added inside those components.

## Notes

- Drop hit areas: dnd-kit's `useSortable` returns props that go on the row's outermost wrapper. The drag handle is a separate inner element with its own listeners — that way, clicks on archive/delete buttons don't interact with drag at all.
- The `5px` activation distance is small enough that intentional drags feel responsive but large enough to suppress accidental drags from button taps.
- If `pnpm install` flags a peer-dependency warning for React 19 on `@dnd-kit`, treat it as a real signal — verify dnd-kit's release notes confirm React 19 support, and bump to the version that does.
