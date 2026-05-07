# CLIENTS-03 — Search & row extraction in ClientsManager

## What

Refactor `ClientsManager.tsx` by extracting the per-row markup and the search/filter logic, then wire the new `SearchInput` primitive ([CLIENTS-02](../CLIENTS-02/assignment.md)) above the list. Searching filters clients and projects together, with auto-expand for clients matched via a project name. No drag-and-drop yet — that's [CLIENTS-04](../CLIENTS-04/assignment.md).

## Why

`ClientsManager.tsx` is currently 304 lines with the orchestration, both row types' markup, and all action handling co-located. Adding search wiring + drag in place would push the file past 400 lines, making it harder to reason about and harder for AI agents to edit reliably (the codebase already follows this "extract when it grows past its purpose" pattern — see `nav.ts`/`nav.test.ts` from SIDEBAR-01). Extracting now keeps each file focused on one job and gives us a pure, well-tested filter helper to lock down the search semantics.

## Acceptance criteria

- [ ] Files exist with these responsibilities:
  - `apps/web/src/app/(authenticated)/clients/ClientsManager.tsx` — orchestrator only: state (search query, openClient, action, cascade, error), top-of-card layout (header + SearchInput + "Nový klient" form), the client list `<ul>`, and the `ConfirmModal`.
  - `apps/web/src/app/(authenticated)/clients/ClientRow.tsx` — one client row including the expanded body with the project list and the "Nový projekt" form.
  - `apps/web/src/app/(authenticated)/clients/ProjectRow.tsx` — one project row.
  - `apps/web/src/app/(authenticated)/clients/filterClients.ts` — pure helper.
  - `apps/web/src/app/(authenticated)/clients/filterClients.test.ts` — Vitest unit tests.
- [ ] `ClientsManager.tsx` is < 220 lines after the refactor.
- [ ] `filterClients(clients, query)` returns `{ visible: Client[], autoExpanded: Set<string> }`:
  - Empty `query` → `visible` is the full input (in input order), `autoExpanded` is empty.
  - Non-empty `query`: a client is in `visible` iff its name matches OR at least one of its projects matches. `autoExpanded` contains the IDs of clients that match via at least one project (regardless of whether the name also matches).
  - When a client is included via project match, `visible[].projects` contains only the matching projects. When included via client-name match, all its projects are included.
  - Diacritic-insensitive: matching uses `s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()` on both query and names. ("agent" matches "Agént".)
  - Case-insensitive.
  - Pure: doesn't mutate the input array or its elements.
- [ ] Tests in `filterClients.test.ts` cover, with `it('US-51: ...')` naming:
  - empty query returns all clients visible, none auto-expanded;
  - matching a client name keeps all its projects;
  - matching a project name auto-expands the parent and includes only matching projects;
  - diacritic insensitivity ("agent" matches "Agént");
  - case insensitivity;
  - archived clients participate in search results (filter doesn't drop them);
  - filter doesn't mutate input.
- [ ] `ClientsManager.tsx` consumes the helper:
  - State: `const [query, setQuery] = useState('')`.
  - Renders a single header row at the top of the orchestrator containing the "Seznam" title on the left (text level matching the existing `CardTitle` styling) and `<SearchInput value={query} onChange={setQuery} ariaLabel={...} clearAriaLabel={...} placeholder={...} />` on the right. The "Nový klient" form sits below this row.
  - `apps/web/src/app/(authenticated)/clients/page.tsx` no longer renders a separate `<CardHeader><CardTitle>Seznam</CardTitle></CardHeader>` — the title moves into `ClientsManager` so it can sit next to the search input. `page.tsx` just renders `<Card><CardBody><ClientsManager .../></CardBody></Card>`.
  - Computes `const { visible, autoExpanded } = filterClients(clients, query)` once per render (`useMemo` if the linter complains; otherwise inline).
  - For each client, the open/closed state is `autoExpanded.has(c.id) || openClient === c.id`.
  - Empty results render the Czech string `Žádné výsledky` (or similar, from `cs.json`) inside the list area.
- [ ] All new strings live in `apps/web/messages/cs.json` under a `clients.search.*` namespace, including: `placeholder`, `ariaLabel`, `clearAriaLabel`, `empty`, and `disabledDrag` (the "Vyhledávání je aktivní – zrušte ho pro řazení." hint, added now even though it's only consumed once [CLIENTS-04](../CLIENTS-04/assignment.md) wires drag). `next-intl`'s `useTranslations` (or the project's existing pattern) is used in the JSX.
- [ ] `cs.json` also gains an `audit.action.reorder` entry (used by the audit log row component) — small piggy-back since we're already touching the file.
- [ ] `pnpm --filter @tt/web test && pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint && pnpm --filter @tt/web build` all green.

## Out of scope

- Drag-and-drop wiring. That's [CLIENTS-04](../CLIENTS-04/assignment.md).
- Adding `@dnd-kit` to `package.json`. That's [CLIENTS-04](../CLIENTS-04/assignment.md).
- Playwright tests. That's [CLIENTS-05](../CLIENTS-05/assignment.md). The pure helper coverage is sufficient for this task.
- Server-side search (URL `?q=` param, route handler). The filter is purely client-side.
- Adding the search UI to other pages (members, tags, audit). Out of scope for this epic.

## Dependencies

- [CLIENTS-02](../CLIENTS-02/assignment.md) — must be merged so `SearchInput` is exported from `@tt/ui`.

## Notes

- Manual `openClient` state and search-driven `autoExpanded` are merged at render time, never written together. Clearing the search collapses auto-expanded clients back to whatever the user had open manually — this is the behavior we want, even though it can briefly look like clients "snap closed" after typing.
- The "Nový projekt" form inside an expanded client should still work while a search is active; if the user types a project name into it that doesn't match the current query, the new project will appear once the search is cleared. That's acceptable; we don't want to silently mutate the search query on add.
- This task does NOT change the page-level Prisma query in `clients/page.tsx`. CLIENTS-01 already changed the orderBy. The data shape going into `ClientsManager` is unchanged.
