# AIAGE-57 Timer Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the tag feature entirely, give each client a colour that tints its name across web and extension, and stop the multi-tab timer bug by putting the web app on the WebSocket — with persistent diagnostics to prove it.

**Architecture:** Three phases on one branch (`feat/aiage-57-timer-feature`). Phase 1 strips tags leaf-first (UI → API → services → schema) so every commit typechecks. Phase 2 adds `Client.color` and threads it through the read paths. Phase 3 makes `apps/web` the first consumer of the already-written-but-unused `createWsClient`, and adds a `chrome.storage.local` ring buffer plus a server-side JSON log line.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Next.js 15 App Router, React 19, Prisma 6 + Postgres 16, Vitest + testcontainers, Playwright, Vite + MV3 for the extension, `next-intl` (Czech UI).

**Spec:** `docs/superpowers/specs/2026-07-27-aiage-57-timer-feature-design.md`

## Global Constraints

- Tech stack is locked. No new dependencies without an ADR.
- Tests use real Postgres + Redis via testcontainers. No DB mocks, ever.
- One user story per `it` block; the US id is embedded in the name: `it('US-102: ...')`.
- Every read endpoint and every mutation needs a cross-company test asserting `not_found` (404, never 403 — it would leak existence).
- Every mutation writes exactly one audit row; assert with the local `auditCount()` helper.
- Czech UI via `next-intl`. Never hardcode user-visible strings in JSX.
- No `.only` / `.skip` / `xit` / `xdescribe` — the pre-commit hook blocks them.
- No `console.*` in `apps/**` or `packages/**` TypeScript — `local/no-console-in-src` is an `error`. `apps/extension/public/background.js` is `.js` and outside `src`, so the rule does not reach it, but use the `diag` buffer there anyway.
- Palette hex values are lowercase 6-digit (`#aabbcc`), matching the existing `ClientColorSchema` regex.
- `Client.color` default is `#6b7280` (neutral grey) and means "unset" — it is deliberately **not** a palette entry.
- The PDF export (`report-pdf.ts`) stays monochrome. Client colour is never applied there.
- Run `pnpm lint && pnpm typecheck` before every commit. Run `pnpm test:trace` before every commit from Task 5 onward.

---

## File Structure

**Phase 1 — deleted**

- `apps/web/src/app/(authenticated)/tags/page.tsx`, `TagsManager.tsx` — whole directory
- `model Tag`, `model TimeEntryTag` in `packages/db/prisma/schema.prisma`
- `createTag` / `updateTag` / `deleteTag` / `listTags` in `apps/web/src/lib/services/catalog.ts`
- `createTagAction` / `updateTagAction` / `deleteTagAction` in `apps/web/src/lib/actions/catalog.ts`

**Phase 1 — created**

- `packages/db/prisma/migrations/<timestamp>_remove_tags/migration.sql`

**Phase 2 — created**

- `packages/db/prisma/migrations/<timestamp>_add_client_color/migration.sql`
- `packages/shared/src/colors.ts` — `CLIENT_COLORS`, `DEFAULT_CLIENT_COLOR`, `isClientColor`
- `packages/ui/src/ColorSwatchPicker.tsx` — lifted from `TagsManager` before deletion
- `apps/web/src/components/ClientName.tsx` — renders a client name in its colour
- `apps/web/tests/services/client-color.test.ts`

**Phase 3 — created**

- `apps/web/src/lib/useTimerSync.ts` — `createWsClient` → `refetch` bridge
- `apps/web/src/lib/diag-log.ts` — one JSON line per timer mutation, gated on `TT_DIAG`
- `apps/extension/src/diag.ts` — capped ring buffer in `chrome.storage.local`
- `apps/extension/src/diag.test.ts`
- `packages/shared/src/ws/client.test.ts`
- `apps/web/tests/e2e/multi-tab-timer.spec.ts`

---

# Phase 1 — Remove tags

Order is leaf-first so each commit typechecks: UI → actions/API → services → schema.

## Task 1: Strip tags from the web UI

**Files:**

- Delete: `apps/web/src/app/(authenticated)/tags/` (both files)
- Modify: `apps/web/src/app/(authenticated)/nav.ts:6,30,69`
- Modify: `apps/web/src/app/(authenticated)/nav.test.ts:27,53-56,99`
- Modify: `apps/web/src/components/nav-icons.tsx` — the `tags` icon entry
- Modify: `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx:230`
- Modify: `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx`
- Modify: `apps/web/src/app/(authenticated)/reports/page.tsx`
- Modify: `apps/web/src/components/time/EditEntryDialog.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerStartCard.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx`
- Modify: `apps/web/src/lib/timer-events.ts:17-24`
- Modify: `apps/web/src/lib/recent.ts`, `apps/web/src/lib/recent.test.ts`
- Modify: `apps/web/messages/cs.json:10,47,75,149,218`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `TimerEntrySchema` in `lib/timer-events.ts` no longer has a `tags` field. `NavKey` no longer has `'tags'`.

**Before you start:** `TagsManager.tsx` contains the `PALETTE` array and swatch-button markup that Phase 2 Task 7 reuses. Copy it somewhere before deleting — it is reproduced in Task 7 so you do not have to, but do not lose it by accident.

- [ ] **Step 1: Update the nav test to the expected post-removal state**

In `apps/web/src/app/(authenticated)/nav.test.ts`, line 27:

```ts
expect(byLabel['Správa dat']).toEqual(['/clients', '/members']);
```

Delete the whole `it('keeps Správa dat with only Štítky for non-admin', ...)` block (lines ~53-56) — with tags gone, a non-admin has no "Správa dat" items at all. Replace it with:

```ts
it('US-18: hides Správa dat entirely for a non-admin', () => {
  const data = navFor({ role: 'user' }).find((g) => g.label === 'Správa dat');
  expect(data).toBeUndefined();
});
```

Remove `'/tags'` from the route list assertion at line ~99.

- [ ] **Step 2: Run the nav test to verify it fails**

Run: `pnpm vitest run apps/web/src/app/\(authenticated\)/nav.test.ts`
Expected: FAIL — `'/tags'` is still in the nav output.

- [ ] **Step 3: Remove tags from the nav**

In `apps/web/src/app/(authenticated)/nav.ts`: delete `| 'tags'` from the `NavKey` union (line 6), delete the `{ href: '/tags', label: 'Štítky', icon: 'tags' }` item (line 30), and delete `'/tags'` from the route array (line 69). If the "Správa dat" group is now empty for non-admins, make the group itself conditional so no empty group renders.

In `apps/web/src/components/nav-icons.tsx`, delete the `tags` icon entry.

- [ ] **Step 4: Run the nav test to verify it passes**

Run: `pnpm vitest run apps/web/src/app/\(authenticated\)/nav.test.ts`
Expected: PASS

- [ ] **Step 5: Delete the tags page**

```bash
rm -r "apps/web/src/app/(authenticated)/tags"
```

- [ ] **Step 6: Remove tags from the shared timer schema**

In `apps/web/src/lib/timer-events.ts`, delete the `tags` field from `TimerEntrySchema` (lines 17-24) so it reads:

```ts
const TimerEntrySchema = z.object({
  id: z.string(),
  description: z.string(),
  clientName: z.string().nullable(),
  projectName: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});
```

- [ ] **Step 7: Remove tag rendering and tag inputs from the remaining components**

Work through each file and delete: tag chips/badges in `RunningTimers.tsx` and `TimerHistory.tsx`, the tag `MultiSelect` and the `tagsMode` AND/OR toggle in `ReportFiltersForm.tsx` (around line 230), the tag column header and cells in `ReportGrouped.tsx`, the tag props threaded from `reports/page.tsx`, and the tag pickers in `EditEntryDialog.tsx` and `TimerStartCard.tsx`. Remove any now-unused `tags` props from component interfaces and any tag field in `lib/recent.ts` plus its assertion in `lib/recent.test.ts`.

- [ ] **Step 8: Remove the Czech tag strings**

In `apps/web/messages/cs.json`, delete the whole `"tags": { ... }` block (line 218) and the four `"tags": "Štítky"` label entries (lines 10, 47, 75, 149). Leave `"tagline"` at line 4 alone — it is unrelated.

- [ ] **Step 9: Verify the app still compiles and tests pass**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run apps/web`
Expected: PASS. Type errors pointing at `entry.tags` or `catalog.tags` mean a render site was missed — fix it here, not in a later task.

- [ ] **Step 10: Commit**

```bash
git add -A apps/web/src apps/web/messages
git commit -m "refactor(web): remove tag UI, nav entry and timer schema field (AIAGE-57)"
```

---

## Task 2: Strip tags from actions, v1 API, exports and MCP tools

**Files:**

- Modify: `apps/web/src/lib/actions/catalog.ts:129-155`
- Modify: `apps/web/src/lib/actions/time.ts:25,60,82,93,117,122,131,144,152,163,172,207,217`
- Modify: `apps/web/src/app/api/v1/entries/route.ts:28,53`
- Modify: `apps/web/src/app/api/v1/entries/[id]/route.ts`, `[id]/play-again/route.ts`
- Modify: `apps/web/src/app/api/v1/timer/route.ts:91,105`
- Modify: `apps/web/src/app/api/v1/catalog/route.ts:17,19,30,43`
- Modify: `apps/web/src/app/api/reports/export.csv/route.ts:17-18`
- Modify: `apps/web/src/app/api/reports/export.pdf/route.ts:65`
- Modify: `apps/web/src/server/mcp/tools/start-timer.ts:11,23,36`
- Modify: `apps/web/src/server/mcp/tools/update-entry.ts`, `list-recent-entries.ts:20,51`, `list-catalog.ts`
- Modify: `apps/web/tests/server/mcp/tools/list-catalog.test.ts`

**Interfaces:**

- Consumes: Task 1's UI no longer sends `tagIds` in any FormData.
- Produces: `/api/v1/catalog` returns `{ companyId, clients }` — no `tags` key. `/api/v1/timer` entry DTOs have no `tags` key. MCP `start_timer` and `update_entry` no longer accept `tagIds`; `list_recent_entries` no longer returns it.

- [ ] **Step 1: Update the MCP catalog test to the expected shape**

In `apps/web/tests/server/mcp/tools/list-catalog.test.ts`, remove every `tags` assertion and assert the key is absent:

```ts
expect(result).not.toHaveProperty('tags');
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/tests/server/mcp/tools/list-catalog.test.ts`
Expected: FAIL — `tags` is still present in the response.

- [ ] **Step 3: Remove tags from the MCP tools**

`start-timer.ts`: delete `tagIds: z.array(z.string()).max(20).optional(),` (line 11), delete `tagIds: args.tagIds,` from the service call (line 36), and drop the `, \`tagIds\`` clause from the tool description string (line 23) so it reads:

```ts
'Starts a new running time entry. Other already-running timers (US-21) are left alone. Optional `title` (the entry name), `clientId`, `projectId`. Use `update_entry` afterwards to set the longer `description`.',
```

`list-recent-entries.ts`: delete `tagIds: z.array(z.string()),` (line 20) and `tagIds: e.tagIds,` (line 51).

`update-entry.ts` and `list-catalog.ts`: delete their `tagIds` / `tags` schema fields and projections the same way.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run apps/web/tests/server/mcp/tools/list-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Remove the tag server actions**

In `apps/web/src/lib/actions/catalog.ts`, delete `createTagAction`, `updateTagAction` and `deleteTagAction` (lines 129-155) and remove `createTag`, `updateTag`, `deleteTag` from the import block at the top (lines 10, 13, 19).

- [ ] **Step 6: Remove tagIds from the time actions**

In `apps/web/src/lib/actions/time.ts`, delete every line that reads or writes `tagIds` (25, 60, 82, 93, 117, 163, 217), the `tags` field on the edit-context return type (122) and its projection (172), the `prisma().tag.findMany(...)` call and its destructuring (144, 152), and every `include: { tags: true }` (131, 207). The `Promise.all` at line 144 collapses to a single `clients` query — unwrap it rather than leaving a one-element `Promise.all`.

- [ ] **Step 7: Remove tags from the v1 API routes and exports**

`v1/entries/route.ts`: delete `tagIds?: string[];` from the body type (28) and `tagIds: body.tagIds ?? [],` from the service call (53). Do the same in `[id]/route.ts` and `[id]/play-again/route.ts`.

`v1/timer/route.ts`: delete the `tags:` line from both `dto` (91) and `historyDto` (105).

`v1/catalog/route.ts`: remove the `tags` key from the early return (17), the `prisma().tag.findMany(...)` from the `Promise.all` (19, 30) and the `tags:` response projection (43). Unwrap the `Promise.all` now that only `clients` remains.

`export.csv/route.ts`: delete `tagIds: sp.getAll('tag'),` and `tagsMode: ...` (17-18). Same for `export.pdf/route.ts` line 65.

- [ ] **Step 8: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run apps/web`
Expected: PASS. Remaining errors should point only at `lib/services/*`, which Task 3 handles — if so, that is expected; if anything else fails, fix it here.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web/src apps/web/tests
git commit -m "refactor(api): drop tagIds from actions, v1 API, exports and MCP tools (AIAGE-57)"
```

---

## Task 3: Strip tags from services, validators and the WS event union

**Files:**

- Modify: `apps/web/src/lib/services/catalog.ts:2-3,373-455`
- Modify: `apps/web/src/lib/services/time-entries.ts:10-11,70,92,105,111,122,142-143,226-227,255,296-301,429,448,511,608,617,628,648`
- Modify: `apps/web/src/lib/services/reports.ts:4,19-20,36,70-74,84,103,205,223`
- Modify: `apps/web/src/lib/services/report-pdf.ts:38,94,102`
- Modify: `packages/shared/src/validators/index.ts:33-35,42`
- Modify: `packages/shared/src/ws/index.ts` — `'tag.changed'`
- Modify: `apps/ws/src/publish.ts` if it references that event type
- Modify: `apps/web/tests/services/catalog.test.ts:3,204-262`
- Modify: `apps/web/tests/services/time-entries.test.ts`, `dashboard-reports.test.ts`, `report-grouped.test.ts`, `report-pdf.test.ts`, `trash.test.ts`, `get-entry-edit-context-action.test.ts`

**Interfaces:**

- Consumes: Task 2's callers no longer pass `tagIds` to any service.
- Produces: `TagColorSchema` is renamed to `ClientColorSchema` (same regex) and re-exported from `packages/shared` — Phase 2 Task 6 imports it. `ReportFilters` has no `tagIds` / `tagsMode`. `EntrySnapshot` has no `tagIds`.

- [ ] **Step 1: Delete the tag tests**

In `apps/web/tests/services/catalog.test.ts`: delete the three tag `it` blocks — `US-16: only admins can rename / recolor / delete tags` (line ~204), `US-17: a regular user can create a tag inline` (~226), and the tag half of `US-18: a regular user can read clients/projects/tags but not write them` (~237). Keep US-18 itself, narrowed to clients and projects, and rename it:

```ts
it('US-18: a regular user can read clients/projects but not write them', async () => {
```

Update the file header comment (line 3) to `Covers US-13, US-14, US-15, US-18.` and drop `createTag`, `deleteTag`, `listTags`, `updateTag` from the import block (lines 14, 17, 21, 24).

In the other listed test files, delete tag assertions, `tagIds` arguments and tag fixtures. Do not leave a test that merely asserts an empty tag array.

- [ ] **Step 2: Run the service tests to verify they fail**

Run: `pnpm vitest run apps/web/tests/services/catalog.test.ts`
Expected: FAIL to compile — `createTag` is imported but the test body referencing it is gone, or vice versa. Either way the suite must not be green yet.

- [ ] **Step 3: Delete the tag service functions**

In `apps/web/src/lib/services/catalog.ts`, delete `createTag`, `updateTag`, `deleteTag` and `listTags` (the `// --- Tags ---` section, lines 373-455) and remove the sentence about tags from the file header comment (lines 2-3).

- [ ] **Step 4: Remove tagIds from time-entries**

In `apps/web/src/lib/services/time-entries.ts`: delete the `EntryWithTags` type (70) and use `TimeEntry` directly; drop `tagIds` from `EntrySnapshot` (92) and `snapshotOf` (105); drop `tagIds?: string[]` from the create (122), duplicate (255) and update input types; delete the `tags: input.tagIds?.length ? ... : undefined` blocks (142-143, 226-227); delete the whole `if (patch.tagIds !== undefined) { ... }` block (296-301); delete every `include: { tags: true }` (111, 448, 511, 617); drop `tagIds` from the listing projections (608, 628, 648); and update the header comment (10-11) and the purge comment (429) to stop mentioning tags.

- [ ] **Step 5: Remove tag filtering and columns from reports**

In `apps/web/src/lib/services/reports.ts`: delete `tagIds?: string[]` and `tagsMode?: 'and' | 'or'` from `ReportFilters` (19-20), the `tags` field from the row type (36), the whole `if (filters.tagIds?.length) { ... }` block (70-74), `tags: { include: { tag: true } }` from the include (84), the `tags:` projection (103), the `'tags'` CSV header (205) and the `r.tags.map(...)` CSV cell (223).

In `apps/web/src/lib/services/report-pdf.ts`: delete `tags: string;` from the labels type (38), `header.push({ text: t.tags, style: 'th' });` (94) and `cells.push({ text: r.tags.map((x) => x.name).join(', ') });` (102).

- [ ] **Step 6: Rename the colour validator and drop tagIds**

In `packages/shared/src/validators/index.ts`, rename the schema at lines 33-35 and delete `tagIds` from `TimeEntryInputSchema` (line 42):

```ts
export const ClientColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Color must be a hex like #aabbcc');
```

In `packages/shared/src/ws/index.ts`, delete `'tag.changed',` from the `WsEventSchema` type enum. Grep for remaining uses and clean them up:

```bash
grep -rn "tag.changed" apps packages --include="*.ts" | grep -v node_modules
```

- [ ] **Step 7: Run the full unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A apps packages
git commit -m "refactor(services): remove tag filtering, columns and validators (AIAGE-57)"
```

---

## Task 4: Drop the tag tables

**Files:**

- Modify: `packages/db/prisma/schema.prisma:91,176-188,208,216-226`
- Modify: `packages/db/src/seed.ts:27-29,100-105,121,134,148`
- Modify: `packages/db/src/test/schema.test.ts`, `packages/db/src/test/seed.test.ts`
- Create: `packages/db/prisma/migrations/<timestamp>_remove_tags/migration.sql`

**Interfaces:**

- Consumes: Task 3 removed every Prisma query touching `tag` / `timeEntryTag`.
- Produces: the Prisma client no longer exposes `prisma.tag` or `prisma.timeEntryTag`.

- [ ] **Step 1: Write the failing schema test**

In `packages/db/src/test/schema.test.ts`, remove the existing tag assertions and add:

```ts
it('US-16: the retired tag tables are gone', async () => {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('tags', 'time_entry_tags')
  `;
  expect(rows).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/db/src/test/schema.test.ts`
Expected: FAIL — both tables still exist.

- [ ] **Step 3: Remove the models from the schema**

In `packages/db/prisma/schema.prisma`: delete `tags Tag[]` from `Company` (line 91), delete `tags TimeEntryTag[]` from `TimeEntry` (line 208), and delete both `model Tag { ... }` (176-188) and `model TimeEntryTag { ... }` (216-226) entirely.

- [ ] **Step 4: Generate the migration**

```bash
pnpm db:up
pnpm --filter @tt/db exec prisma migrate dev --name remove_tags
```

Expected: creates `packages/db/prisma/migrations/<timestamp>_remove_tags/migration.sql` containing `DROP TABLE "time_entry_tags";` and `DROP TABLE "tags";`. Open the file and confirm the join table is dropped **before** the parent — if Prisma emitted them the other way round, reorder them by hand.

- [ ] **Step 5: Clean the seed**

In `packages/db/src/seed.ts`: delete `tagA1`, `tagA2`, `tagB1` from `SEED_IDS` (27-29), the whole `// --- Tags` block with `tx.tag.createMany` (100-105), and the three `tags: { create: [...] }` lines on the seed entries (121, 134, 148). Update the file header (line 4) to `2 single-company users, clients/projects/entries on known dates.` Remove tag assertions from `packages/db/src/test/seed.test.ts`.

- [ ] **Step 6: Regenerate and verify**

```bash
pnpm prisma:generate && pnpm prisma:migrate && pnpm prisma:seed
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all PASS, including the new schema test.

- [ ] **Step 7: Commit**

```bash
git add -A packages/db
git commit -m "feat(db)!: drop tags and time_entry_tags tables (AIAGE-57)"
```

---

## Task 5: Strip tags from the extension

**Files:**

- Modify: `apps/extension/src/api.ts:31,46,59,335,391,414`
- Modify: `apps/extension/src/EntrySheet.tsx:43,62,91-92,117,126,268-278`
- Modify: `apps/extension/tests/e2e/fixtures.ts`

**Interfaces:**

- Consumes: `/api/v1/catalog` no longer returns `tags` (Task 2).
- Produces: `CatalogDto` has no `tags`; `EntryDto` has no `tags`; none of the three mutation input types accept `tagIds`.

- [ ] **Step 1: Remove tags from the extension API types**

In `apps/extension/src/api.ts`: delete `export interface TagDto { ... }` (line 31), the `tags: TagDto[];` fields on the catalog and entry DTOs (46, 59), and `tagIds?: string[];` from the three mutation input interfaces (335, 391, 414).

- [ ] **Step 2: Remove the tag picker from the entry sheet**

In `apps/extension/src/EntrySheet.tsx`: delete `tagIds: string[];` from the props/initial type (43), the `const [tagIds, setTagIds] = useState(...)` line (62), the `toggleTag` function (91-92), `tagIds,` from both submit payloads (117, 126), and the whole `{catalog.tags.length > 0 ? (...) : null}` chip block (268-278).

- [ ] **Step 3: Remove tag fixtures**

In `apps/extension/tests/e2e/fixtures.ts`, delete tag fixtures and any `tags` key on catalog/entry fixture objects.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @tt/extension test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A apps/extension
git commit -m "refactor(extension): remove tag picker and tag DTOs (AIAGE-57)"
```

---

## Task 6: Retire US-16/US-17 and update the docs

**Files:**

- Modify: `scripts/test-trace.ts:10-12,44-77`
- Modify: `docs/reference/features.md:23,28-30,35,62,145`
- Modify: `docs/reference/acceptance.md:16-17`
- Modify: `docs/reference/data-model.md`
- Modify: `docs/operations/mcp-server.md`
- Modify: `docs/architecture/README.md`

**Interfaces:**

- Consumes: Tasks 1-5 deleted every test naming US-16 or US-17.
- Produces: `pnpm test:trace` passes with a `RETIRED` set; later phases raise `TOTAL_US` to 104.

- [ ] **Step 1: Run test:trace to see the failure**

Run: `pnpm test:trace`
Expected: FAIL — `Missing tests for: US-16, US-17`

- [ ] **Step 2: Add the retired set**

In `scripts/test-trace.ts`, after the `USIDS` definition (line 12):

```ts
/** Retired user stories — the feature they described was removed. */
const RETIRED = new Set(['US-16', 'US-17']); // tags, removed in AIAGE-57
```

In `main()`, skip retired ids when collecting misses and exclude them from the denominator:

```ts
const missing: string[] = [];
for (const id of USIDS) {
  if (RETIRED.has(id)) continue;
  if (found.get(id)!.size === 0) missing.push(id);
}

const expected = TOTAL_US - RETIRED.size;
const covered = expected - missing.length;
const pct = ((covered / expected) * 100).toFixed(1);
process.stdout.write(`US coverage: ${covered}/${expected} (${pct}%, ${RETIRED.size} retired)\n`);
```

- [ ] **Step 3: Run test:trace to verify it passes**

Run: `pnpm test:trace`
Expected: PASS — `US coverage: 99/99 (100.0%, 2 retired)`

- [ ] **Step 4: Update features.md**

Rename the section heading at line 23 to `## Clients and projects`. Mark the two retired stories in place — do **not** renumber, the list is positional and every other doc references these ids:

```markdown
- **US-16** — ~~Admin manages a company-wide tag list (rename, recolor, delete).~~ **Retired in AIAGE-57** (tags removed).
- **US-17** — ~~User creates a new tag inline while filling out an entry.~~ **Retired in AIAGE-57** (tags removed).
```

Reword the four stories that mention tags in passing, leaving their meaning otherwise intact: US-18 (line 30) drop `, and tags`; US-20 (line 35) drop ` / tags`; US-41 (line 62) drop ` / tag` from the filter matrix; US-97 (line 145) drop `(cascading its tag joins)`.

Update the closing "Coverage check" paragraph to say US-1..US-101 with US-16 and US-17 retired.

- [ ] **Step 5: Update the remaining docs**

`docs/reference/acceptance.md` lines 16-17: drop `and tags` from the bullet and drop the `US-16 (tag rename/recolor/delete admin-only), US-17 (user inline tag)` clauses from the test-file reference.

`docs/reference/data-model.md`: remove the `Tag` and `TimeEntryTag` entries.

`docs/operations/mcp-server.md`: remove `tagIds` from the documented `start_timer` / `update_entry` inputs and `list_recent_entries` output, noting the tool surface changed in AIAGE-57.

`docs/architecture/README.md`: remove tags from the feature description.

- [ ] **Step 6: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:trace
git add -A scripts docs
git commit -m "docs: retire US-16/US-17 and drop tags from reference docs (AIAGE-57)"
```

---

# Phase 2 — Client colour

## Task 7: Add `Client.color`, the palette and the swatch picker

**Files:**

- Modify: `packages/db/prisma/schema.prisma` — `model Client`
- Create: `packages/db/prisma/migrations/<timestamp>_add_client_color/migration.sql`
- Create: `packages/shared/src/colors.ts`
- Modify: `packages/shared/src/index.ts` — re-export
- Create: `packages/ui/src/ColorSwatchPicker.tsx`
- Modify: `packages/ui/src/index.ts` — re-export

**Interfaces:**

- Consumes: `ClientColorSchema` from `packages/shared/src/validators/index.ts` (renamed in Task 3).
- Produces:
  - `CLIENT_COLORS: readonly string[]` — 10 palette hexes
  - `DEFAULT_CLIENT_COLOR: '#6b7280'`
  - `isClientColor(value: string): boolean` — true for a palette entry or the default
  - `<ColorSwatchPicker value={string} onChange={(hex: string) => void} label={string} disabled?={boolean} />` — `label` is required (it names the radio group for screen readers)
  - `Client.color: string` on the Prisma model

- [ ] **Step 1: Write the failing palette test**

Create `packages/shared/src/colors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR, isClientColor } from './colors.js';
import { ClientColorSchema } from './validators/index.js';

describe('client colours', () => {
  it('US-102: the palette holds 10 distinct lowercase hex colours', () => {
    expect(CLIENT_COLORS).toHaveLength(10);
    expect(new Set(CLIENT_COLORS).size).toBe(10);
    for (const c of CLIENT_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('US-102: the default grey is not a palette entry', () => {
    expect(CLIENT_COLORS).not.toContain(DEFAULT_CLIENT_COLOR);
    expect(DEFAULT_CLIENT_COLOR).toBe('#6b7280');
  });

  it('US-102: isClientColor accepts palette entries and the default, rejects anything else', () => {
    expect(isClientColor(CLIENT_COLORS[0]!)).toBe(true);
    expect(isClientColor(DEFAULT_CLIENT_COLOR)).toBe(true);
    expect(isClientColor('#123456')).toBe(false);
    expect(isClientColor('red')).toBe(false);
  });

  it('US-102: every palette entry satisfies ClientColorSchema', () => {
    for (const c of CLIENT_COLORS) expect(ClientColorSchema.safeParse(c).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/shared/src/colors.test.ts`
Expected: FAIL — `Cannot find module './colors.js'`

- [ ] **Step 3: Write the palette**

Create `packages/shared/src/colors.ts`:

```ts
/**
 * Client colours (US-102). Ten fixed hues, each picked to stay legible as
 * *text* on both the light and the dark app background — the client name is
 * tinted, not just a swatch. DEFAULT_CLIENT_COLOR is deliberately outside the
 * palette: it is the "no colour chosen" state and renders as ordinary grey.
 */
export const DEFAULT_CLIENT_COLOR = '#6b7280';

export const CLIENT_COLORS = [
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // amber
  '#16a34a', // green
  '#0d9488', // teal
  '#0284c7', // sky
  '#2563eb', // blue
  '#7c3aed', // violet
  '#c026d3', // fuchsia
  '#db2777', // pink
] as const;

export function isClientColor(value: string): boolean {
  return value === DEFAULT_CLIENT_COLOR || (CLIENT_COLORS as readonly string[]).includes(value);
}
```

Re-export from `packages/shared/src/index.ts`:

```ts
export { CLIENT_COLORS, DEFAULT_CLIENT_COLOR, isClientColor } from './colors.js';
```

Add a leaf export to `packages/shared/package.json` so the extension popup can import the
palette **without** dragging `zod` and `date-fns-tz` into its bundle — the popup already
does exactly this for `@tt/shared/time/duration`, and `apps/extension/src/DESCRIPTION.md`
documents that as a deliberate rule:

```json
    "./colors": "./src/colors.ts",
```

Keep the map alphabetical: it goes between `"."` and `"./time"`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run packages/shared/src/colors.test.ts`
Expected: PASS

- [ ] **Step 5: Add the column to the schema**

In `packages/db/prisma/schema.prisma`, add to `model Client` just after `sortOrder`:

```prisma
  color     String   @default("#6b7280")
```

- [ ] **Step 6: Generate the migration**

```bash
pnpm --filter @tt/db exec prisma migrate dev --name add_client_color
pnpm prisma:generate
```

Expected: `ALTER TABLE "clients" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#6b7280';` — every existing client keeps rendering exactly as before.

- [ ] **Step 7: Build the swatch picker**

Create `packages/ui/src/ColorSwatchPicker.tsx` (this is the `TagsManager` picker, generalised — the original is already deleted):

```tsx
'use client';

import type { ReactElement } from 'react';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  /** Accessible label for the radio group. */
  label: string;
}

export function ColorSwatchPicker({
  value,
  onChange,
  disabled = false,
  label,
}: ColorSwatchPickerProps): ReactElement {
  const options = [DEFAULT_CLIENT_COLOR, ...CLIENT_COLORS];
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          disabled={disabled}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={`h-7 w-7 rounded-full ring-offset-2 disabled:opacity-50 ${
            value === c ? 'ring-2 ring-zinc-900 dark:ring-zinc-100' : ''
          }`}
        />
      ))}
    </div>
  );
}
```

Re-export it from `packages/ui/src/index.ts`.

- [ ] **Step 8: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run packages/shared
git add -A packages
git commit -m "feat(db,ui): add Client.color, the 10-colour palette and ColorSwatchPicker (AIAGE-57)"
```

---

## Task 8: `updateClientColor` service and action

**Files:**

- Modify: `apps/web/src/lib/services/catalog.ts`
- Modify: `apps/web/src/lib/actions/catalog.ts`
- Create: `apps/web/tests/services/client-color.test.ts`

**Interfaces:**

- Consumes: `isClientColor` from `@tt/shared`; `requireAdmin`, `writeAudit`, `Result`, `Db` from the existing `catalog.ts` module scope.
- Produces:
  - `updateClientColor(db: Db, actorUserId: string, clientId: string, color: string): Promise<Result<true, 'not_found' | 'invalid'>>`
  - `updateClientColorAction(clientId: string, color: string): Promise<ActionResult>`

- [ ] **Step 1: Write the failing service test**

Create `apps/web/tests/services/client-color.test.ts`. Mirror the `World` / `withTx` / `auditCount` setup used at the top of `apps/web/tests/services/catalog.test.ts` (lines 27-62) — copy that scaffolding verbatim so the fixtures match.

```ts
/**
 * Client colour (US-102).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';
import { createClient, updateClientColor } from '../../src/lib/services/catalog.js';

// ... beforeAll/afterAll/World/seedWorld/auditCount copied from catalog.test.ts ...

describe('client colour', () => {
  it('US-102: an admin sets a client colour and it writes exactly one audit row', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const before = await auditCount(tx, w.company);

      const res = await updateClientColor(tx, w.admin, c.value.id, CLIENT_COLORS[0]!);

      expect(res).toEqual({ ok: true, value: true });
      const row = await tx.client.findUnique({ where: { id: c.value.id } });
      expect(row?.color).toBe(CLIENT_COLORS[0]);
      expect((await auditCount(tx, w.company)) - before).toBe(1);
    });
  });

  it('US-102: a new client starts at the neutral default', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const row = await tx.client.findUnique({ where: { id: c.value.id } });
      expect(row?.color).toBe(DEFAULT_CLIENT_COLOR);
    });
  });

  it('US-102: a non-admin member cannot set a colour', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const res = await updateClientColor(tx, w.user, c.value.id, CLIENT_COLORS[1]!);
      expect(res).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-102: an actor from another company gets not_found, not a permission error', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const res = await updateClientColor(tx, w.outsider, c.value.id, CLIENT_COLORS[1]!);
      expect(res).toEqual({ ok: false, reason: 'not_found' });
    });
  });

  it('US-102: an off-palette colour is rejected and writes no audit row', async () => {
    await withTx(async (tx) => {
      const w = await seedWorld(tx);
      const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
      if (!c.ok) throw new Error('setup failed');
      const before = await auditCount(tx, w.company);

      const res = await updateClientColor(tx, w.admin, c.value.id, '#123456');

      expect(res).toEqual({ ok: false, reason: 'invalid' });
      expect(await auditCount(tx, w.company)).toBe(before);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/tests/services/client-color.test.ts`
Expected: FAIL — `updateClientColor` is not exported from `catalog.ts`.

- [ ] **Step 3: Implement the service**

Append to `apps/web/src/lib/services/catalog.ts`, following the `updateClientFund` shape (validate → look up → `requireAdmin` → update → `writeAudit`):

```ts
export async function updateClientColor(
  db: Db,
  actorUserId: string,
  clientId: string,
  color: string,
): Promise<Result<true, 'not_found' | 'invalid'>> {
  if (!isClientColor(color)) return { ok: false, reason: 'invalid' };
  const c = await db.client.findUnique({ where: { id: clientId } });
  if (!c) return { ok: false, reason: 'not_found' };
  const auth = await requireAdmin(db, actorUserId, c.companyId);
  if (!auth.ok) return { ok: false, reason: 'not_found' };
  await db.client.update({ where: { id: clientId }, data: { color } });
  await writeAudit(db, {
    companyId: c.companyId,
    actorUserId,
    action: 'update',
    entityType: 'client_color',
    entityId: clientId,
    before: { color: c.color },
    after: { color },
  });
  return { ok: true, value: true };
}
```

Add `import { isClientColor } from '@tt/shared';` to the imports.

Note the validation runs **before** the lookup so an off-palette value never touches the database — that is what the "no audit row" assertion pins down.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run apps/web/tests/services/client-color.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the server action**

In `apps/web/src/lib/actions/catalog.ts`, following the shape of the neighbouring client actions:

```ts
export async function updateClientColorAction(
  clientId: string,
  color: string,
): Promise<ActionResult> {
  const s = await requireSession();
  const r = await updateClientColor(prisma(), s.userId, clientId, color);
  if (!r.ok) return { ok: false, error: r.reason };
  revalidatePath('/clients');
  return { ok: true };
}
```

Import `updateClientColor` from the service module. Match the exact session helper and `ActionResult` shape the other actions in this file use — copy from `renameClientAction` rather than inventing one.

- [ ] **Step 6: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run apps/web/tests/services/client-color.test.ts
git add -A apps/web
git commit -m "feat(clients): updateClientColor service and action with audit row (AIAGE-57)"
```

---

## Task 9: Thread the colour through every read path

**Files:**

- Modify: `apps/web/src/lib/services/catalog.ts` — `listClients` projection
- Modify: `apps/web/src/lib/services/reports.ts:96,103,117,149-165`
- Modify: `apps/web/src/lib/services/dashboard.ts:114,142,259,382`
- Modify: `apps/web/src/lib/actions/time.ts:144`
- Modify: `apps/web/src/app/api/v1/timer/route.ts:86,100`
- Modify: `apps/web/src/app/api/v1/catalog/route.ts`
- Modify: `apps/web/src/lib/timer-events.ts`
- Modify: `apps/web/src/app/(authenticated)/clients/page.tsx`
- Modify: `apps/extension/src/api.ts:54,282`

**Interfaces:**

- Consumes: `Client.color` from Task 7; `DEFAULT_CLIENT_COLOR` from `@tt/shared`.
- Produces: every client-bearing DTO carries a colour. Names used by Task 10:
  - `TimerEntry.clientColor: string | null` (null when the entry has no client)
  - `/api/v1/catalog` client objects gain `color: string`
  - `ClientRowItem.color: string`
  - reports rows gain `clientColor: string | null`
  - dashboard fund rows gain `clientColor: string`

- [ ] **Step 1: Write the failing API test**

In `apps/web/tests/services/` add to the existing timer-route or reports test (whichever already covers `/api/v1/timer` DTO shape — grep for `clientName` in `apps/web/tests`):

```ts
it('US-102: the timer DTO carries the client colour alongside the name', async () => {
  await withTx(async (tx) => {
    const w = await seedWorld(tx);
    const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
    if (!c.ok) throw new Error('setup failed');
    await updateClientColor(tx, w.admin, c.value.id, CLIENT_COLORS[2]!);
    const started = await startTimer(tx, w.user, {
      companyId: w.company,
      description: 'x',
      clientId: c.value.id,
    });
    if (!started.ok) throw new Error('setup failed');

    const [row] = await listRunningEntries(tx, w.user, w.company);

    expect(row?.clientName).toBe('Acme');
    expect(row?.clientColor).toBe(CLIENT_COLORS[2]);
  });
});

it('US-102: an entry with no client reports a null colour', async () => {
  await withTx(async (tx) => {
    const w = await seedWorld(tx);
    const started = await startTimer(tx, w.user, { companyId: w.company, description: 'x' });
    if (!started.ok) throw new Error('setup failed');

    const [row] = await listRunningEntries(tx, w.user, w.company);

    expect(row?.clientName).toBeNull();
    expect(row?.clientColor).toBeNull();
  });
});
```

Substitute the real listing function and its signature — grep `apps/web/tests/services` for
`clientName` to find which service the existing DTO-shape tests call, and use that one.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/tests/services`
Expected: FAIL — `clientColor` is `undefined`.

- [ ] **Step 3: Add colour to the v1 timer DTOs**

In `apps/web/src/app/api/v1/timer/route.ts`, in `dto` after line 86 and in `historyDto` after line 100:

```ts
      clientColor: e.client?.color ?? null,
```

For `historyDto` the source row is a flattened projection, so also add `clientColor` to whatever service produces it (`time-entries.ts` history listing) and select `color` on the `client` relation there.

- [ ] **Step 4: Add colour to the remaining read paths**

- `lib/timer-events.ts` — add `clientColor: z.string().nullable(),` to `TimerEntrySchema`.
- `lib/services/catalog.ts` `listClients` — include `color` in the projection.
- `lib/services/reports.ts` — select `color` on the client relation (84), project `clientColor: r.client?.color ?? null` (96, 103), add `clientColor: string | null` to the row and group types (29, 117), and carry it through the grouping branches (149-165).
- `lib/services/dashboard.ts` — add `clientColor` to the fund row type (259) and both projections (142, 382).
- `lib/actions/time.ts:144` — select `color` on the clients query and include it in the returned client list.
- `app/api/v1/catalog/route.ts` — add `color: c.color` to each client in the response.
- `app/(authenticated)/clients/page.tsx` — add `color: c.color,` to the `ClientsManager` mapping.
- `apps/extension/src/api.ts` — add `clientColor: string | null;` to the entry DTO (54) and `color: string;` to the catalog client DTO (282).

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm lint && pnpm typecheck && pnpm vitest run apps/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A apps packages
git commit -m "feat(clients): expose client colour on every read path (AIAGE-57)"
```

---

## Task 10: Render the colour

**Files:**

- Create: `apps/web/src/components/ClientName.tsx`
- Modify: `apps/web/src/app/(authenticated)/clients/ClientRow.tsx`, `ClientsManager.tsx`
- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx:118`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerHistory.tsx:129`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerLists.tsx:24,34,46`
- Modify: `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx:37,74,122`
- Modify: `apps/web/src/app/(authenticated)/dashboard/ClientFundsCard.tsx:95`
- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx:155`
- Modify: `apps/web/src/app/(authenticated)/trash/TrashList.tsx:107,147`
- Modify: `apps/extension/src/popup.tsx`
- Modify: `apps/web/messages/cs.json`

**Interfaces:**

- Consumes: the DTO fields from Task 9; `ColorSwatchPicker` from `@tt/ui`; `updateClientColorAction` from Task 8.
- Produces: `<ClientName name={string | null} color={string | null} fallback?={string} />`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/components/ClientName.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CLIENT_COLORS, DEFAULT_CLIENT_COLOR } from '@tt/shared';
import { ClientName } from './ClientName';

describe('ClientName', () => {
  it('US-102: renders the name tinted with the client colour', () => {
    render(<ClientName name="Acme" color={CLIENT_COLORS[0]!} />);
    expect(screen.getByText('Acme')).toHaveStyle({ color: CLIENT_COLORS[0] });
  });

  it('US-102: the neutral default sets no inline colour so the theme wins', () => {
    render(<ClientName name="Acme" color={DEFAULT_CLIENT_COLOR} />);
    expect(screen.getByText('Acme').style.color).toBe('');
  });

  it('US-102: a missing client renders the fallback with no colour', () => {
    render(<ClientName name={null} color={null} fallback="—" />);
    expect(screen.getByText('—').style.color).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/src/components/ClientName.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/ClientName.tsx`:

```tsx
import type { ReactElement } from 'react';
import { DEFAULT_CLIENT_COLOR } from '@tt/shared';

export interface ClientNameProps {
  name: string | null;
  color: string | null;
  /** Rendered when there is no client. Defaults to an em dash. */
  fallback?: string;
}

/**
 * A client's name, tinted with its colour (US-102). The neutral default means
 * "no colour chosen", so it deliberately sets no inline colour and inherits
 * the surrounding theme — that keeps every pre-AIAGE-57 client looking exactly
 * as it did.
 */
export function ClientName({ name, color, fallback = '—' }: ClientNameProps): ReactElement {
  if (!name) return <span>{fallback}</span>;
  const tinted = color && color !== DEFAULT_CLIENT_COLOR;
  return <span style={tinted ? { color } : undefined}>{name}</span>;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run apps/web/src/components/ClientName.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Use it at every render site**

Replace the bare client-name spans:

- `RunningTimers.tsx:118` — `{entry.clientName ? <span>{entry.clientName}</span> : null}` becomes `{entry.clientName ? <ClientName name={entry.clientName} color={entry.clientColor} /> : null}`
- `TimerHistory.tsx:129` — same shape.
- `TimerLists.tsx:24,34,46` — add `clientColor` to the view types and both mapping functions so the two components above receive it.
- `ReportGrouped.tsx:74,122` — `{r.clientName ?? '—'}` becomes `<ClientName name={r.clientName} color={r.clientColor} />`. Line 37 builds a `${g.clientName} → ${g.label}` **string** for a heading; leave that as plain text — a tinted fragment inside a template string is not worth the complexity.
- `ClientFundsCard.tsx:95`, `dashboard/page.tsx:155`, `TrashList.tsx:107,147` — same substitution.

- [ ] **Step 6: Add the picker to the clients admin**

In `ClientRow.tsx`: add `color: string;` to `ClientRowItem`, import `ColorSwatchPicker` from `@tt/ui` and `updateClientColorAction`, and render the picker in the client's expanded row next to the fund form:

```tsx
<ColorSwatchPicker
  label={t('clients.colorLabel')}
  value={client.color}
  disabled={pending}
  onChange={(hex) => {
    startTransition(async () => {
      const r = await updateClientColorAction(client.id, hex);
      if (!r.ok) setError(t('clients.colorError'));
    });
  }}
/>
```

Add `clients.colorLabel` (`"Barva klienta"`) and `clients.colorError` (`"Barvu se nepodařilo uložit."`) to `apps/web/messages/cs.json`. Pass `color` through `ClientsManager.tsx`.

- [ ] **Step 7: Colour the extension**

The extension does not use `next-intl` and does not import `@tt/ui` components, so `ClientName` is not reusable here — but the _rule_ must not be duplicated as a magic hex. Import the constant via the leaf path added in Task 7:

```tsx
import { DEFAULT_CLIENT_COLOR } from '@tt/shared/colors';

function clientTint(color: string | null): { color: string } | undefined {
  return color && color !== DEFAULT_CLIENT_COLOR ? { color } : undefined;
}
```

Then in each entry row of `apps/extension/src/popup.tsx`:

```tsx
<span style={clientTint(e.clientColor)}>{e.clientName}</span>
```

Use the same `clientTint` helper in `EntrySheet.tsx` wherever the selected client is displayed — export it from `popup.tsx` or a small shared module rather than writing the comparison twice.

- [ ] **Step 8: Add the Playwright coverage**

In `apps/web/tests/e2e/`, add to the clients spec (or create `client-color.spec.ts`):

```ts
test('US-102: an admin picks a client colour and it tints the timer list', async ({ page }) => {
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Acme' }).click();
  // The picker renders [DEFAULT_CLIENT_COLOR, ...CLIENT_COLORS], so nth(4) is
  // CLIENT_COLORS[3] === '#16a34a' === rgb(22, 163, 74).
  await page.getByRole('radiogroup', { name: 'Barva klienta' }).getByRole('radio').nth(4).click();
  await page.goto('/timer');
  const name = page.getByText('Acme').first();
  await expect(name).toHaveCSS('color', 'rgb(22, 163, 74)');
});
```

The off-by-one here is easy to get wrong: the default grey occupies index 0, so the palette
is shifted by one. Re-derive the expected `rgb()` from `CLIENT_COLORS` if you change the index.

- [ ] **Step 9: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add -A apps packages
git commit -m "feat(clients): tint client names across web and extension (AIAGE-57)"
```

---

# Phase 3 — Cross-tab sync and diagnostics

## Task 11: Let `createWsClient` authenticate by cookie

**Files:**

- Modify: `packages/shared/src/ws/client.ts:17-23,36`
- Create: `packages/shared/src/ws/client.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `WsClientOpts.token` becomes optional. When omitted, no `?token=` is appended and the browser's `tt-session` cookie authenticates the socket (`apps/ws/src/server.ts:37-41` already reads either).

**Context:** `createWsClient` is currently dead code — `grep -rn "createWsClient" apps packages` matches only its definition and re-export. The extension hand-rolls its own socket. This task is the first time it runs anywhere, so its reconnect behaviour gets tested rather than trusted.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/ws/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createWsClient } from './client.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  listeners = new Map<string, ((e: unknown) => void)[]>();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  emit(type: string, e?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  close(): void {
    this.readyState = 3;
  }
}

function makeClient(opts: { token?: string } = {}) {
  FakeSocket.instances = [];
  const client = createWsClient({
    url: 'wss://example.test/ws',
    ...opts,
    WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
  });
  return { client, sockets: FakeSocket.instances };
}

describe('createWsClient', () => {
  it('US-103: appends the token when one is supplied', () => {
    const { sockets } = makeClient({ token: 'abc def' });
    expect(sockets[0]!.url).toBe('wss://example.test/ws?token=abc%20def');
  });

  it('US-103: omits the query string entirely when there is no token, so the cookie authenticates', () => {
    const { sockets } = makeClient();
    expect(sockets[0]!.url).toBe('wss://example.test/ws');
  });

  it('US-103: delivers parsed events to every subscriber', () => {
    const { client, sockets } = makeClient();
    const seen: unknown[] = [];
    client.subscribe((e) => seen.push(e));
    sockets[0]!.emit('message', { data: JSON.stringify({ type: 'timer.stopped' }) });
    expect(seen).toEqual([{ type: 'timer.stopped' }]);
  });

  it('US-103: unsubscribing stops delivery', () => {
    const { client, sockets } = makeClient();
    const seen: unknown[] = [];
    const off = client.subscribe((e) => seen.push(e));
    off();
    sockets[0]!.emit('message', { data: JSON.stringify({ type: 'timer.stopped' }) });
    expect(seen).toEqual([]);
  });

  it('US-103: reconnects with exponential backoff after a close', () => {
    vi.useFakeTimers();
    const { sockets } = makeClient();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emit('close');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2); // 1000ms not yet elapsed
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    vi.useRealTimers();
  });

  it('US-103: an open resets the backoff to its floor', () => {
    vi.useFakeTimers();
    const { sockets } = makeClient();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(500);
    sockets[1]!.emit('open');
    sockets[1]!.emit('close');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(3);
    vi.useRealTimers();
  });

  it('US-103: close() stops reconnecting', () => {
    vi.useFakeTimers();
    const { client, sockets } = makeClient();
    client.close();
    sockets[0]!.emit('close');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    vi.useRealTimers();
  });

  it('US-103: a malformed frame is reported and does not kill the socket', () => {
    const onError = vi.fn();
    FakeSocket.instances = [];
    const client = createWsClient({
      url: 'wss://example.test/ws',
      onError,
      WebSocketCtor: FakeSocket as unknown as typeof WebSocket,
    });
    const seen: unknown[] = [];
    client.subscribe((e) => seen.push(e));
    FakeSocket.instances[0]!.emit('message', { data: 'not json' });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run packages/shared/src/ws/client.test.ts`
Expected: FAIL — the no-token case produces `wss://example.test/ws?token=`, and `token` is a required option so the call does not typecheck.

- [ ] **Step 3: Make the token optional**

In `packages/shared/src/ws/client.ts`, change the option (line 19) and the URL construction (line 36):

```ts
export interface WsClientOpts {
  url: string;
  /** Omit in the browser: the `tt-session` cookie authenticates instead. */
  token?: string;
  /** Override for tests (default: global WebSocket). */
  WebSocketCtor?: typeof WebSocket;
  onError?: (err: unknown) => void;
}
```

```ts
const url = opts.token ? `${opts.url}?token=${encodeURIComponent(opts.token)}` : opts.url;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest run packages/shared/src/ws/client.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add -A packages/shared
git commit -m "feat(shared): cookie auth for createWsClient, plus its first tests (AIAGE-57)"
```

---

## Task 12: Put the web timer page on the WebSocket

**Files:**

- Create: `apps/web/src/lib/useTimerSync.ts`
- Modify: `apps/web/src/app/(authenticated)/timer/page.tsx` — pass `wsUrl`
- Modify: `apps/web/src/app/(authenticated)/timer/TimerLists.tsx:92-122`
- Modify: `docs/reference/env-vars.md`

**Interfaces:**

- Consumes: `createWsClient` with an optional token (Task 11).
- Produces: `useTimerSync(wsUrl: string | null, onChange: () => void): void`

**Context:** `WS_PUBLIC_URL` is documented in `docs/reference/env-vars.md:14` but **no `NEXT_PUBLIC_*` variable is read anywhere in `apps/web`**. Read it server-side in the page component and pass it down as a prop — that keeps it a runtime value, which matters for a self-hosted app where the URL is set per deployment, not at build time.

- [ ] **Step 1: Write the failing hook test**

Create `apps/web/src/lib/useTimerSync.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTimerSync } from './useTimerSync.js';

const subscribe = vi.fn();
const close = vi.fn();
vi.mock('@tt/shared', async (orig) => ({
  ...(await orig<typeof import('@tt/shared')>()),
  createWsClient: vi.fn(() => ({ subscribe, close, readyState: () => 1 })),
}));

describe('useTimerSync', () => {
  it('US-103: does not open a socket when there is no ws url', () => {
    renderHook(() => useTimerSync(null, vi.fn()));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('US-103: fires onChange for timer and time_entry events only', () => {
    const onChange = vi.fn();
    renderHook(() => useTimerSync('wss://x.test/ws', onChange));
    const listener = subscribe.mock.calls[0]![0] as (e: { type: string }) => void;

    listener({ type: 'timer.started' });
    listener({ type: 'time_entry.updated' });
    listener({ type: 'membership.changed' });

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('US-103: closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useTimerSync('wss://x.test/ws', vi.fn()));
    unmount();
    expect(close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/src/lib/useTimerSync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

Create `apps/web/src/lib/useTimerSync.ts`:

```ts
'use client';

/**
 * Keeps the timer page in sync with changes made anywhere else — another tab,
 * another window, another Chrome profile, or the extension (US-103).
 *
 * Before this existed the page refetched only on its own `tt:timer-changed`
 * event and on `visibilitychange`, so two *visible* tabs never learned about
 * each other and acted on stale entry ids.
 *
 * Auth is the `tt-session` cookie: the WS server accepts either that or a
 * `?token=` query param, and the browser sends the cookie for us.
 */
import { useEffect, useRef } from 'react';
import { createWsClient } from '@tt/shared';

export function useTimerSync(wsUrl: string | null, onChange: () => void): void {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!wsUrl) return;
    const client = createWsClient({ url: wsUrl });
    const unsubscribe = client.subscribe((evt) => {
      if (evt.type.startsWith('timer.') || evt.type.startsWith('time_entry.')) {
        onChangeRef.current();
      }
    });
    return () => {
      unsubscribe();
      client.close();
    };
  }, [wsUrl]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run apps/web/src/lib/useTimerSync.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into the timer page**

In `apps/web/src/app/(authenticated)/timer/page.tsx`, read the URL server-side and pass it down:

```tsx
<TimerLists wsUrl={process.env.WS_PUBLIC_URL ?? null} /* ...existing props... */ />
```

In `TimerLists.tsx`, accept `wsUrl: string | null` in the props interface, hoist `refetch` out of the existing `useEffect` (lines 92-122) into a `useCallback` so both the effect and the hook can call it, and add:

```ts
useTimerSync(wsUrl, refetch);
```

Keep the existing `TIMER_CHANGED_EVENT` and `visibilitychange` listeners — they are the fallback when the socket is down.

- [ ] **Step 6: Document the env var**

In `docs/reference/env-vars.md`, amend the `WS_PUBLIC_URL` row (line 14) to note it is now consumed by the web timer page as well as the extension, and that leaving it unset disables live cross-tab sync (the page falls back to refetch-on-focus).

- [ ] **Step 7: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run apps/web
git add -A apps/web docs
git commit -m "feat(web): live cross-tab timer sync over WebSocket (US-103, AIAGE-57)"
```

---

## Task 13: Handle a stop that another surface already performed

**Files:**

- Modify: `apps/web/src/app/(authenticated)/timer/TimerLists.tsx` — stop handler
- Modify: `apps/web/src/app/(authenticated)/timer/RunningTimers.tsx`
- Modify: `apps/web/messages/cs.json`
- Modify: `apps/web/tests/services/time-entries.test.ts`

**Interfaces:**

- Consumes: `refetch` from Task 12.
- Produces: stopping an already-stopped entry refreshes the list and shows a neutral notice instead of surfacing an error.

- [ ] **Step 1: Write the failing service test**

In `apps/web/tests/services/time-entries.test.ts`:

```ts
it('US-103: stopping an entry that is already stopped reports a conflict rather than corrupting it', async () => {
  await withTx(async (tx) => {
    const w = await seedWorld(tx);
    const started = await startTimer(tx, w.user, { companyId: w.company, description: 'x' });
    if (!started.ok) throw new Error('setup failed');
    const first = await stopTimer(tx, w.user, started.value.id);
    expect(first.ok).toBe(true);
    const endedAt = (await tx.timeEntry.findUnique({ where: { id: started.value.id } }))?.endedAt;

    const second = await stopTimer(tx, w.user, started.value.id);

    expect(second).toEqual({ ok: false, reason: 'conflict' });
    const after = await tx.timeEntry.findUnique({ where: { id: started.value.id } });
    expect(after?.endedAt).toEqual(endedAt); // the first stop time survives
  });
});
```

Adjust the helper names to whatever `time-entries.test.ts` already uses for seeding and starting.

- [ ] **Step 2: Run it to verify it fails or passes**

Run: `pnpm vitest run apps/web/tests/services/time-entries.test.ts`
Expected: If it already PASSES, the service is fine and only the UI needs work — record that and skip Step 3. If it FAILS, the second stop is overwriting `endedAt`; fix `stopTimer` to return `{ ok: false, reason: 'conflict' }` when `endedAt` is already set, and re-run until green.

- [ ] **Step 3: Re-fetch immediately before a stop or start**

The socket closes the window but does not eliminate it: a click landing between an
external change and the frame that applies it still acts on a stale id. In
`TimerLists.tsx`, `await refetch()` at the top of the stop and start handlers, then read
the entry id from the freshly-set state rather than from the value captured at render:

```ts
const handleStop = async (id: string): Promise<void> => {
  await refetch();
  const stillRunning = runningRef.current.some((r) => r.id === id);
  if (!stillRunning) {
    setNotice(t('timer.alreadyStopped'));
    return;
  }
  // ...existing stop call...
};
```

Keep a `runningRef` mirroring the `running` state so the handler reads the post-refetch
value instead of the closure's stale snapshot — this is the whole point of the step, and
reading `running` directly here would silently defeat it.

- [ ] **Step 4: Make the UI treat a conflict as information, not failure**

In `TimerLists.tsx` / `RunningTimers.tsx`, wherever the stop action's result is handled, branch on the conflict reason: call `refetch()` and show a neutral inline notice rather than an error alert.

Add to `apps/web/messages/cs.json`:

```json
"timer": {
  "alreadyStopped": "Tento záznam už byl zastaven jinde. Seznam byl aktualizován."
}
```

Place it inside the existing `timer` block rather than creating a second one.

- [ ] **Step 5: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run apps/web
git add -A apps/web
git commit -m "fix(web): refetch before stop/start and treat a stale stop as a refresh (US-103, AIAGE-57)"
```

---

## Task 14: Extension diagnostics ring buffer

**Files:**

- Create: `apps/extension/src/diag.ts`
- Create: `apps/extension/src/diag.test.ts`
- Modify: `apps/extension/src/sync.ts`
- Modify: `apps/extension/src/popup.tsx`
- Modify: `apps/extension/public/background.js`

**Interfaces:**

- Consumes: `StorageAdapter` / `InMemoryStorageAdapter` from `apps/extension/src/storage.ts`.
- Produces:
  - `DIAG_KEY = 'tt:diag'`, `DIAG_CAP = 300`
  - `interface DiagRecord { ts: number; surface: 'popup' | 'sw' | 'web'; instance: string; event: string; data?: Record<string, unknown> }`
  - `class Diag { constructor(storage: StorageAdapter, surface: DiagRecord['surface'], instance: string, now?: () => number); log(event: string, data?: Record<string, unknown>): Promise<void>; read(): Promise<DiagRecord[]>; clear(): Promise<void> }` — `now` defaults to `Date.now` and exists so tests get deterministic timestamps

**Context:** the popup unmounts every time it closes, so DevTools console output is lost — that is why this is persisted rather than printed. `local/no-console-in-src` also makes `console.*` a lint error in `apps/**` TypeScript.

- [ ] **Step 1: Write the failing tests**

Create `apps/extension/src/diag.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Diag, DIAG_CAP } from './diag.js';
import { InMemoryStorageAdapter } from './storage.js';

function makeDiag(instance = 'inst-1') {
  const storage = new InMemoryStorageAdapter();
  return { storage, diag: new Diag(storage, 'popup', instance, () => 1000) };
}

describe('Diag', () => {
  it('US-104: records an event with its surface, instance and payload', async () => {
    const { diag } = makeDiag();
    await diag.log('stop:click', { entryId: 'e1' });
    expect(await diag.read()).toEqual([
      {
        ts: 1000,
        surface: 'popup',
        instance: 'inst-1',
        event: 'stop:click',
        data: { entryId: 'e1' },
      },
    ]);
  });

  it('US-104: keeps records in chronological order', async () => {
    const { diag } = makeDiag();
    await diag.log('a');
    await diag.log('b');
    await diag.log('c');
    expect((await diag.read()).map((r) => r.event)).toEqual(['a', 'b', 'c']);
  });

  it('US-104: never grows past the cap and drops the oldest first', async () => {
    const { diag } = makeDiag();
    for (let i = 0; i < DIAG_CAP + 10; i += 1) await diag.log(`e${i}`);
    const rows = await diag.read();
    expect(rows).toHaveLength(DIAG_CAP);
    expect(rows[0]!.event).toBe('e10');
    expect(rows[rows.length - 1]!.event).toBe(`e${DIAG_CAP + 9}`);
  });

  it('US-104: two instances writing to one buffer stay distinguishable', async () => {
    const storage = new InMemoryStorageAdapter();
    const a = new Diag(storage, 'popup', 'A', () => 1);
    const b = new Diag(storage, 'sw', 'B', () => 2);
    await a.log('x');
    await b.log('y');
    const rows = await a.read();
    expect(rows.map((r) => [r.surface, r.instance, r.event])).toEqual([
      ['popup', 'A', 'x'],
      ['sw', 'B', 'y'],
    ]);
  });

  it('US-104: clear empties the buffer', async () => {
    const { diag } = makeDiag();
    await diag.log('a');
    await diag.clear();
    expect(await diag.read()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run apps/extension/src/diag.test.ts`
Expected: FAIL — `Cannot find module './diag.js'`

- [ ] **Step 3: Write the ring buffer**

Create `apps/extension/src/diag.ts`:

```ts
/**
 * Diagnostic ring buffer (US-104).
 *
 * The popup unmounts every time it closes, so console output is gone before
 * anyone can read it — and `local/no-console-in-src` bans console anyway.
 * Instead every surface appends to one capped buffer in chrome.storage.local,
 * tagged with a per-instance id so separate windows, and separate Chrome
 * profiles, stay distinguishable in the merged timeline.
 */
import type { StorageAdapter } from './storage.js';

export const DIAG_KEY = 'tt:diag';
export const DIAG_CAP = 300;

export interface DiagRecord {
  ts: number;
  surface: 'popup' | 'sw' | 'web';
  instance: string;
  event: string;
  data?: Record<string, unknown>;
}

export class Diag {
  constructor(
    private storage: StorageAdapter,
    private surface: DiagRecord['surface'],
    private instance: string,
    private now: () => number = Date.now,
  ) {}

  async log(event: string, data?: Record<string, unknown>): Promise<void> {
    try {
      const rows = (await this.storage.get<DiagRecord[]>(DIAG_KEY)) ?? [];
      const rec: DiagRecord = {
        ts: this.now(),
        surface: this.surface,
        instance: this.instance,
        event,
        ...(data ? { data } : {}),
      };
      rows.push(rec);
      const trimmed = rows.length > DIAG_CAP ? rows.slice(rows.length - DIAG_CAP) : rows;
      await this.storage.set(DIAG_KEY, trimmed);
    } catch {
      // Diagnostics must never break a mutation. Losing a record is fine.
    }
  }

  async read(): Promise<DiagRecord[]> {
    return (await this.storage.get<DiagRecord[]>(DIAG_KEY)) ?? [];
  }

  async clear(): Promise<void> {
    await this.storage.remove(DIAG_KEY);
  }
}
```

The `try/catch` in `log` is deliberate: a storage failure must never turn a successful stop into a thrown error — that is exactly the failure mode AIAGE-55 fixed and this must not reintroduce it.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm vitest run apps/extension/src/diag.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Instrument sync.ts**

In `apps/extension/src/sync.ts`, create one module-level instance next to the existing `queue` and `pendingOverlaps` (line 43-44):

```ts
const diag = new Diag(storage, 'popup', crypto.randomUUID());
```

Add `void diag.log(...)` calls — never `await`, so diagnostics cannot delay a mutation — at:

- `executeStart`: before the call `{ event: 'start:click' }`, after success `{ event: 'start:ok' }`, on enqueue `{ event: 'start:queued' }`
- `executeStop`: `stop:click` with `{ entryId }`, `stop:ok` with `{ entryId, hadOverlap: Boolean(res.overlap) }`, `stop:queued`, and in the non-network branch `stop:error` with `{ entryId, status: err instanceof ApiError ? err.status : null }`
- `drain`: `queue:flush` with `{ applied: result.applied, conflicts: result.conflicts }`
- the WS effect: `ws:open`, `ws:close`, and `ws:event` with `{ type: msg.type }`
- `executeOrEnqueue`: `queue:enqueue` with `{ kind: fallbackMutation.kind }`

Also log `refresh:done` with the running entry ids wherever the popup completes a refetch — that is the single most valuable record for this bug, because it shows what each instance believed was running at each moment.

- [ ] **Step 6: Instrument the service worker**

In `apps/extension/public/background.js`, add a small inline appender (it cannot import the TS module) that writes the same shape to the same key, with `surface: 'sw'` and an instance id generated once per worker start:

```js
const DIAG_KEY = 'tt:diag';
const DIAG_CAP = 300;
const SW_INSTANCE = crypto.randomUUID();

async function diag(event, data) {
  try {
    const out = await chrome.storage.local.get(DIAG_KEY);
    const rows = out[DIAG_KEY] ?? [];
    rows.push({
      ts: Date.now(),
      surface: 'sw',
      instance: SW_INSTANCE,
      event,
      ...(data ? { data } : {}),
    });
    await chrome.storage.local.set({
      [DIAG_KEY]: rows.length > DIAG_CAP ? rows.slice(rows.length - DIAG_CAP) : rows,
    });
  } catch {
    /* diagnostics are best-effort */
  }
}
```

Call it from `poll()` (`poll:result` with `{ running }`, `poll:401`, `poll:error`), from the `chrome.storage.onChanged` listener (`storage:changed` with `{ keys: Object.keys(changes) }` — but skip when the only changed key is `tt:diag`, or it will log itself in a loop), and from `onMessage` (`sw:nudge`).

- [ ] **Step 7: Add the export control to the popup**

In `apps/extension/src/popup.tsx`, add a "Zkopírovat diagnostiku" button in the settings/footer area:

```tsx
<button
  type="button"
  onClick={() => {
    void (async () => {
      const rows = await diag.read();
      await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
      setToast('Diagnostika zkopírována');
    })();
  }}
>
  Zkopírovat diagnostiku
</button>
```

Use whatever toast/notice mechanism the popup already has rather than adding a new one.

- [ ] **Step 8: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm --filter @tt/extension test
git add -A apps/extension
git commit -m "feat(extension): persistent diagnostic ring buffer across popup and worker (US-104, AIAGE-57)"
```

---

## Task 15: Server-side timer timeline

**Files:**

- Create: `apps/web/src/lib/diag-log.ts`
- Create: `apps/web/tests/services/diag-log.test.ts`
- Modify: `apps/web/src/app/api/v1/timer/route.ts`, `apps/web/src/app/api/v1/timer/[id]/stop/route.ts`
- Modify: `docs/reference/env-vars.md`

**Interfaces:**

- Consumes: nothing.
- Produces: `logTimerDiag(entry: { actorUserId: string; entryId: string | null; source: 'web' | 'extension' | 'mcp'; action: 'start' | 'stop'; outcome: 'ok' | 'conflict' | 'error' }): void`

**Context:** this is what actually solves correlation. Every surface and every Chrome profile hits the same server, so one ordered timeline in the Coolify log beats N per-client buffers. `console.*` is banned, so it writes via `process.stdout.write` — the same approach `scripts/test-trace.ts` uses.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/diag-log.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logTimerDiag } from '../../src/lib/diag-log.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TT_DIAG;
});

const entry = {
  actorUserId: 'u1',
  entryId: 'e1',
  source: 'extension' as const,
  action: 'stop' as const,
  outcome: 'ok' as const,
};

describe('logTimerDiag', () => {
  it('US-104: writes nothing unless TT_DIAG is enabled', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    logTimerDiag(entry);
    expect(write).not.toHaveBeenCalled();
  });

  it('US-104: writes one JSON line per call when enabled', () => {
    process.env.TT_DIAG = '1';
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    logTimerDiag(entry);

    expect(write).toHaveBeenCalledTimes(1);
    const line = write.mock.calls[0]![0] as string;
    expect(line.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      tag: 'tt:diag',
      actorUserId: 'u1',
      entryId: 'e1',
      source: 'extension',
      action: 'stop',
      outcome: 'ok',
    });
    expect(typeof parsed.ts).toBe('string');
  });

  it('US-104: a stdout failure never propagates to the caller', () => {
    process.env.TT_DIAG = '1';
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => logTimerDiag(entry)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/tests/services/diag-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write it**

Create `apps/web/src/lib/diag-log.ts`:

```ts
/**
 * One JSON line per timer mutation (US-104), gated behind TT_DIAG.
 *
 * Every surface — web tab, extension popup, MCP, any Chrome profile — hits this
 * server, so this is the only place that can produce a single ordered timeline
 * across all of them. Per-client buffers cannot.
 *
 * Written with process.stdout.write rather than console, which is banned in
 * apps/** by local/no-console-in-src.
 */
export interface TimerDiagEntry {
  actorUserId: string;
  entryId: string | null;
  source: 'web' | 'extension' | 'mcp';
  action: 'start' | 'stop';
  outcome: 'ok' | 'conflict' | 'error';
}

export function logTimerDiag(entry: TimerDiagEntry): void {
  if (process.env.TT_DIAG !== '1') return;
  try {
    process.stdout.write(
      `${JSON.stringify({ tag: 'tt:diag', ts: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // Diagnostics must never break a request.
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm vitest run apps/web/tests/services/diag-log.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Call it from the timer routes**

In the v1 timer start and stop route handlers, call `logTimerDiag` on each outcome branch. Derive `source` from how the request authenticated — a bearer token means `'extension'`, a session cookie means `'web'`; the routes already distinguish these to build their session object, so reuse that rather than adding a header.

- [ ] **Step 6: Document TT_DIAG**

Add a row to `docs/reference/env-vars.md`:

| `TT_DIAG` | Set to `1` to emit one JSON line per timer start/stop for cross-surface debugging. Off by default. | `1` |

- [ ] **Step 7: Verify and commit**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run apps/web
git add -A apps/web docs
git commit -m "feat(web): TT_DIAG server-side timer timeline (US-104, AIAGE-57)"
```

---

## Task 16: Two-tab end-to-end proof, US registration and docs

**Files:**

- Create: `apps/web/tests/e2e/multi-tab-timer.spec.ts`
- Modify: `scripts/test-trace.ts:10` — `TOTAL_US`
- Modify: `docs/reference/features.md`, `docs/reference/acceptance.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/gotchas.md`

**Interfaces:**

- Consumes: everything from Tasks 11-15.
- Produces: US-102, US-103, US-104 registered and covered; `TOTAL_US` 101 → 104.

- [ ] **Step 1: Write the failing two-context E2E test**

Create `apps/web/tests/e2e/multi-tab-timer.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('US-103: a stop in one tab clears the running timer in another visible tab', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: 'apps/web/tests/e2e/.auth/user.json' });
  const tabA = await context.newPage();
  const tabB = await context.newPage();

  await tabA.goto('/timer');
  await tabB.goto('/timer');

  await tabA.getByRole('textbox', { name: 'Popis' }).fill('cross-tab check');
  await tabA.getByRole('button', { name: 'Spustit' }).click();
  await expect(tabA.getByText('cross-tab check')).toBeVisible();

  // Tab B must learn about it over the socket, with no focus change.
  await expect(tabB.getByText('cross-tab check')).toBeVisible({ timeout: 10_000 });

  await tabA.getByRole('button', { name: 'Zastavit' }).first().click();

  // ...and must see the stop too.
  await expect(tabB.getByTestId('running-timers').getByText('cross-tab check')).toBeHidden({
    timeout: 10_000,
  });

  await context.close();
});
```

Match the storage-state path, role names and any `data-testid` to what the existing specs in `apps/web/tests/e2e/` use — check `global-setup.ts` for the auth fixture path, and add a `data-testid="running-timers"` to `RunningTimers.tsx` if one is not already there.

- [ ] **Step 2: Run it to verify it fails without the socket**

Temporarily unset `WS_PUBLIC_URL` and run:

Run: `pnpm --filter @tt/web exec playwright test tests/e2e/multi-tab-timer.spec.ts`
Expected: FAIL at the tab B assertion — this is the bug reproducing, and it proves the test actually exercises the socket rather than passing on a coincidental refetch.

- [ ] **Step 3: Run it with the socket configured**

Restore `WS_PUBLIC_URL` and re-run.
Expected: PASS

- [ ] **Step 4: Register the new user stories**

In `scripts/test-trace.ts`, line 10: `const TOTAL_US = 104;`

Append to `docs/reference/features.md`:

```markdown
## Timer feature (AIAGE-57)

- **US-102** — Admin picks a client colour from a fixed ten-colour palette; the client's name renders in that colour in the timer lists, reports, dashboard, trash and the extension. Clients created before the feature keep the neutral grey default, which renders exactly as before. The PDF export stays monochrome. Non-admins cannot set a colour, cross-company returns `not_found`, and the update writes exactly one audit row.
- **US-103** — `/timer` reflects a start or stop performed elsewhere (another tab, another window, another Chrome profile, the extension) without a focus change, over the WebSocket. Stopping an entry another surface already stopped refreshes the list and reports it neutrally instead of erroring.
- **US-104** — The extension popup and service worker append diagnostic records to a capped `chrome.storage.local` ring buffer tagged with a per-instance id, and the popup exports them as JSON. With `TT_DIAG=1` the server emits one JSON line per timer start/stop, giving one ordered timeline across every surface.
```

Update the closing "Coverage check" paragraph to US-1..US-104. Add matching entries to `docs/reference/acceptance.md` pointing at the test files.

- [ ] **Step 5: Run the full gate**

Run: `pnpm test:all`
Expected: PASS — `US coverage: 102/102 (100.0%, 2 retired)`

- [ ] **Step 6: Update architecture docs and log the gotcha**

In `docs/architecture/README.md`: record that the web app is now a WebSocket consumer (it was not before), that `createWsClient` is shared by web and — still — hand-rolled in the extension, and that tags are gone.

Append to `docs/gotchas.md`:

```markdown
### 2026-07-27 — Two visible browser tabs never saw each other's timers

`apps/web` had no WebSocket client at all — `grep -rln "createWsClient" apps/web/src` was
empty — while `packages/shared/src/ws/client.ts` had exported one, unused, since the WS
service was built. `/timer` refetched only on its own same-tab CustomEvent and on
`visibilitychange`, so two tabs that were both _visible_ (two windows, two monitors) held
divergent state and acted on stale entry ids: Stop hit an already-stopped entry, Start
created a duplicate.

Fix: `useTimerSync` in `apps/web/src/lib/`, built on the existing `createWsClient`, which
gained optional-token support so the browser's `tt-session` cookie authenticates it —
`apps/ws/src/server.ts` already accepted either.

Lesson: an exported module with no importers is not "shared infrastructure", it is dead
code. Grep for consumers before assuming a capability is wired up.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(e2e): two-tab timer sync proof; register US-102..US-104 (AIAGE-57)"
```

---

## Done

Run `pnpm test:all` one final time, then hand back for `/plane-task finish` — that runs `secure-commit` and posts the summary to Plane.

**Deliberately out of scope** (worth follow-up tasks):

- Migrating the extension off its hand-rolled `WebSocket` (`sync.ts:157-199`) onto `createWsClient`. It works today, and changing it while Phase 3 also changes stop/start behaviour would muddy the diagnostics this task exists to produce.
- A UI for reading the diagnostic buffer beyond copy-to-clipboard.
- Renumbering user stories to close the US-16/US-17 gap. The list is positional and referenced across every doc; the `RETIRED` set is the cheaper honest answer.
