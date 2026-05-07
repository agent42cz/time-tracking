# CLIENTS-01 — Data plumbing & read-site sweep

## What

Add a per-company canonical sort order to `Client` and `Project`, expose it through new server-side service functions and server actions, and update every Client/Project read site to honor it. No UI changes in this task — the page still looks identical, but the foundation for search and drag-and-drop is in place.

## Why

Search and drag-and-drop are the user-visible features ([CLIENTS-03](../CLIENTS-03/assignment.md), [CLIENTS-04](../CLIENTS-04/assignment.md)), but they depend on a working data layer first. Splitting the data work out lets it land as a self-contained, reviewable migration + service-layer change without UI churn in the same diff. It also lets the read-site sweep happen once, atomically, instead of being scattered across UI tasks.

The order needs to be honored everywhere a Client or Project is listed (timer dropdown, extension catalog, weekly report filters, etc.) so users only have to think about ordering in one place.

## Acceptance criteria

- [ ] Prisma migration adds `sort_order Int @default(0)` to both `clients` and `projects` tables.
- [ ] Migration adds composite indexes `(company_id, archived, sort_order)` on `clients` and `(client_id, archived, sort_order)` on `projects`.
- [ ] Migration extends the `audit_action` enum with a `reorder` value.
- [ ] Migration's data step backfills existing rows: `sort_order = row_number() over (partition by company_id order by name asc)` for clients and the equivalent partitioned by `client_id` for projects.
- [ ] `apps/web/src/lib/services/catalog.ts` exports `reorderClients({ companyId, actorUserId, orderedIds })` and `reorderProjects({ companyId, clientId, actorUserId, orderedIds })`.
- [ ] Each service function validates that `orderedIds` is exactly the set of _active_ IDs in scope; mismatch (foreign-company id, missing id, extra id, archived id) throws `NotFound` (not 400, not 403).
- [ ] Each service function writes `sortOrder = i + 1` for each id at index `i` inside a single Prisma transaction, then inserts exactly one `AuditLog` row with `action: 'reorder'`, the appropriate `entityType` / `entityId`, and `before` / `after` JSON containing the ID arrays.
- [ ] `apps/web/src/lib/actions/catalog.ts` exports `reorderClientsAction(orderedIds)` and `reorderProjectsAction(clientId, orderedIds)`. Both use `requireAdmin()`, call the service, `revalidatePath('/clients')`, and return `{ ok: true } | { ok: false; error: string }` via the existing `mapServiceError` helper.
- [ ] All Client/Project Prisma reads in the codebase use the canonical sort tuple `[{ archived: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }]`. Confirmed sites: `apps/web/src/app/(authenticated)/clients/page.tsx`, `apps/web/src/app/(authenticated)/timer/page.tsx`, `apps/web/src/app/api/v1/catalog/route.ts`. Implementation does a `grep -rn "orderBy" apps/web packages` sweep to catch any others.
- [ ] Integration tests in `apps/web/src/lib/services/catalog.test.ts` (real Postgres via testcontainers) cover: success path writes 1..N + one audit row (US-52, US-53); ignoring archived rows during reorder; cross-company id rejection (404); missing id rejection (404); read-side sort tuple regression.
- [ ] `pnpm prisma:generate && pnpm prisma:migrate && pnpm test && pnpm typecheck && pnpm lint` all green.

## Out of scope

- Any UI work on `/clients` (search input, drag handles, row extraction). That's [CLIENTS-03](../CLIENTS-03/assignment.md) and [CLIENTS-04](../CLIENTS-04/assignment.md).
- The `SearchInput` primitive in `@tt/ui`. That's [CLIENTS-02](../CLIENTS-02/assignment.md).
- The `@dnd-kit` dependency and the ADR. That's [CLIENTS-04](../CLIENTS-04/assignment.md).
- Playwright E2E coverage. That's [CLIENTS-05](../CLIENTS-05/assignment.md).
- Audit log UI labels for the new `reorder` action. (Touched in CLIENTS-03 alongside the other UI strings.)
- Removing the existing `archived asc, name asc` order from any read site that doesn't read Client or Project (e.g. tags, members) — those orderings stay alphabetical.

## Dependencies

None. This task and [CLIENTS-02](../CLIENTS-02/assignment.md) can run in parallel.

## Notes

- **No `@@unique([companyId, sortOrder])`.** Unique would cause transient collisions when two rows swap inside a transaction. Procedural uniqueness via the full-reindex is sufficient; `name asc` is the tie-breaker if a duplicate ever shows up.
- **Audit semantics.** Adding `reorder` to the enum (instead of overloading `update`) is decided at the epic level. The audit log component will gain a Czech label for it as part of CLIENTS-03's `cs.json` change.
- **Test data.** The integration tests will need a seeded company with at least 3 clients and 3 projects to verify ordering meaningfully. If the existing `seedCompany` helper doesn't expose project counts, extend it inside this task.
