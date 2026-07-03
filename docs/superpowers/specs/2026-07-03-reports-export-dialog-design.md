# Reports export dialog: pick period + person(s) → PDF/CSV

- **Date:** 2026-07-03
- **Status:** Approved (not yet implemented)
- **New user story:** US-89 (export dialog — choose period + person(s) + format)
- **Builds on:** US-77 (grouped report), US-78 (PDF export) — see `2026-06-01-reports-grouped-pdf-export-design.md`
- **Plane task:** AIAGE-50 ("Bug Timetracker", priority urgent)
- **New ADR:** none (reuses the existing route + service layer; no stack/architecture change)

## 1. Problem

On `/reports` the most prominent export action, **"Výkaz za minulý měsíc (PDF)"**, is a hardcoded link
to `/api/reports/export.pdf?preset=lastMonth&groupBy=project`. It carries **no member filter**, so for an
admin it exports **every member's entries lumped together** in one document. This is the reported bug:

> "Při exportu dat za minulý měsíc se exportují všichni uživatelé dohromady. Chci udělat export tlačítko,
> kde si vyberu za jaké období a koho vyexportuju do PDF."

The backend already supports what's needed — `runReport` scopes by `memberIds` and by role, and the PDF/CSV
routes already accept `from`/`to`/`member[]`/`groupBy`. The capability exists; only the **UI** forces a
clunky path: to produce one person's statement today you must set the date range, open the "Členové"
multi-select, pick the member, click **"Použít filtry"** (full page reload), and only then click
**"Stáhnout PDF"**. The filter step and the export step are decoupled, and the one obvious one-click button
ignores scoping entirely.

## 2. Goals / non-goals

**Goals**

- A single **"Export"** button on the reports header that opens a dialog to choose **period**, **person(s)**,
  and **format**, then downloads — matching "udělat export tlačítko, kde si vyberu za jaké období a koho".
- Producing **one person's** work statement (výkaz) must be a direct, one-dialog action.
- Keep a company-wide export possible, but as a **deliberate "Všichni členové" choice**, not the default.
- Preserve the existing **CSV** export (its standalone button is being removed).

**Non-goals (YAGNI)**

- **Per-person ZIP** (separate file per member). Decision: multiple/all selected people go into **one** PDF,
  sectioned per person. (Confirmed with the requester.)
- **XLSX** export (still pending elsewhere; unrelated).
- Scheduled / emailed reports; charts; logo upload.
- Any backend/service redesign or new export endpoint.

## 3. Decisions (from requester Q&A, 2026-07-03)

| Question                           | Decision                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF output when >1 person          | **Single PDF for the scope.** One person → their statement. Several/all → one PDF with a section + subtotal per person (reuses `groupBy=member`). |
| Fit with existing 3 header buttons | **Replace all three** with one "Export" dialog (period + person(s) + format → download).                                                          |
| Keep "all members" export          | **Yes**, as an explicit **"Všichni členové"** option. Default is a specific person (the current user).                                            |
| Grouping control in the dialog     | Included, with a **smart default**: Projektu for one person, Člena when several/all are selected. User can override.                              |

## 4. Approach

**Chosen: A — client-side dialog over the existing GET export routes.**

The dialog is a client component that collects the selections, builds a query string, and triggers a
download by hitting the **existing** `GET /api/reports/export.pdf` / `GET /api/reports/export.csv`. Those
routes already run `runReport` (correct role + member scoping) → `buildGroupedReport` →
`buildReportPdf` / `rowsToCsv`. **No new service or route code** is required for correctness.

Alternatives considered and rejected:

- **B — new `POST /api/reports/export` endpoint returning the file.** Cleaner payload and room for a future
  per-person ZIP, but duplicates logic the GET routes already have and own tests. Over-engineered for
  "single PDF for the scope."
- **C — fix the buttons in place** (make "last month" respect the member filter; make filter→export obvious).
  Smallest change, but keeps the decoupled two-step flow. Rejected by the requester.

## 5. UX & components

### 5.1 Header change

Replace the three header actions in `apps/web/src/app/(authenticated)/reports/page.tsx`
(`Výkaz za minulý měsíc`, `Stáhnout CSV`, `Stáhnout PDF`) with a **single "Export" button** that opens the
dialog. The modal shell reuses **`ConfirmModal` from `@tt/ui`**, the same primitive
`AutoStackPreviewDialog` builds on (there is no generic `Dialog` export in `@tt/ui`).

### 5.2 `ExportDialog` (new client component)

`apps/web/src/app/(authenticated)/reports/ExportDialog.tsx` — `'use client'`. Props from the server page:
`isAdmin`, `meId`, `members: {id,name}[]`, and `initial` (current page filters, for pre-fill). Fields:

1. **Období** — the preset chips (Dnes … Minulý měsíc) + custom `from`/`to` date inputs. Extract the existing
   `preset()` helper and `PRESETS` array out of `ReportFiltersForm` into a shared
   `apps/web/src/app/(authenticated)/reports/date-presets.ts` so both use one copy (no logic change; a
   targeted de-dup in service of this feature). Default **Minulý měsíc**. Client-side guard: `from ≤ to`.
2. **Osoba** _(admin only)_ — a **multi-select of members** plus an explicit **"Všichni členové"** entry.
   Reuse `@/components/MultiSelect`. Default selection = **the current user** (`meId`). Non-admins: the whole
   field is hidden — they can only ever export themselves, and the route enforces this regardless of params.
   Selecting "Všichni členové" clears specific members (→ no `member` param → all).
3. **Formát** — **PDF** (default) / **CSV** toggle. Keeps CSV export reachable now that its button is gone.
4. **Seskupení** — Projektu / Člena / Dne. **Smart default** via a pure `resolveExportGroupBy(scope, count)`,
   recomputed as the person selection changes: `member` when several or "all" are selected, otherwise
   `project`. User may override; once overridden the manual choice sticks for the open dialog.

To make the member selection readable in JS (the dialog builds a URL rather than submitting a native form),
`MultiSelect` gains an **optional, backward-compatible `onChange?: (ids: string[]) => void`** callback
(existing form-based consumers pass nothing and are unaffected).

### 5.3 Export action

A pure `buildExportUrl(input)` (in `export-url.ts`, no React import → node-testable) builds the target URL:

- `from`, `to` — always sent as explicit `YYYY-MM-DD` (the dialog never uses the route's `preset` path).
- `member` — appended once per selected member; **omitted entirely** when "Všichni členové" is chosen.
- `groupBy` — the resolved grouping.
- Target route by format: `/api/reports/export.pdf?…` or `/api/reports/export.csv?…`.

Download is triggered by creating a temporary `<a href download>` and clicking it (attachment
`Content-Disposition` means the browser downloads without navigating away), then the dialog closes. This
mirrors today's `<a href>` buttons; a 404 (broken session only) would render the route's text body in a new
context — acceptable and unchanged from current behavior.

**Pre-fill:** the dialog opens seeded from the page's current filters (period + selected members) for
convenience, but it exports **exactly what the dialog shows** — predictable, independent of the live page
filters (clients/projects/tags/search are not carried into the export).

## 6. Data flow

```
ExportDialog (client)
  → query string (from,to,member*,groupBy) + format→route
  → GET /api/reports/export.{pdf,csv}     [unchanged]
  → requireActiveCompany → runReport (role + member scoping)   [unchanged]
  → buildGroupedReport → buildReportPdf / rowsToCsv            [unchanged]
  → file download (attachment)
```

## 7. Backend

- **No change required for correctness.** The routes already accept every param the dialog sends.
- **Keep** the PDF route's `preset=lastMonth` branch untouched — it is covered by US-78 tests; the dialog
  simply never uses it. (Removing it would churn passing tests for no benefit.)
- **Optional polish (not in v1):** include the person's name in a single-person PDF filename
  (`vykaz-<slug>-YYYY-MM.pdf`). The route has the member id(s); it could look up the name. Deferred to keep
  the change scoped to the UI; the current date-based filename is retained.

## 8. i18n

All strings via `next-intl` (`cs.json`), constitution rule — no hardcoded JSX text.

- **Add** a `reports.export` dialog subtree: `button` ("Export"), `dialogTitle` ("Exportovat výkaz"),
  field labels (`period`, `person`, `format`, `grouping`), `allMembers` ("Všichni členové"),
  `submit` ("Exportovat"), and validation (`invalidRange`).
- **Remove** the now-unused button strings `reports.export.lastMonth`, `reports.export.csv`,
  `reports.export.pdf` (referenced only by the deleted buttons).
- The PDF/CSV **format toggle** gets its own short labels — new keys `reports.export.format.pdf`
  ("PDF") and `reports.export.format.csv` ("CSV") — distinct from the removed button labels above.

## 9. Testing (US-89)

The repo has **no React component-test harness** — vitest runs in the `node` environment and there is no
`@testing-library/react`/jsdom/happy-dom. So the export logic is tested as **pure functions** (matching how
`report-pdf`, `buildGroupedReport`, `rowsToCsv` are tested), and the React `ExportDialog` stays thin wiring.
Real Postgres via testcontainers for route tests (constitution: no DB mocks). Embed `US-89` in every
`it(...)` so `pnpm test:trace` sees the story.

- **Pure-function unit tests (node):**
  - `export-url.test.ts` — `US-89`: `buildExportUrl` emits `member=<id>` per selected member; **omits** `member`
    for "all"; targets `export.pdf` vs `export.csv` by format; includes explicit `from`/`to` and `groupBy`.
    `resolveExportGroupBy` returns `member` for all / multi-select, `project` otherwise.
  - `date-presets.test.ts` — `US-89`: `preset('lastMonth', fixedNow)` returns the previous calendar month's
    `from`/`to` (deterministic via an injected `now`).
- **Route tests (real Postgres):**
  - `reports-export-pdf-route.test.ts` (extend) — `US-89`: a `?member=<id>&from&to` request returns `200`,
    `application/pdf`, `%PDF-`; and the mandatory **cross-company 404** with a `member` param present.
  - `reports-export-csv-route.test.ts` (**new**) — `US-89`: with members A and B both holding entries,
    `?member=<A>` returns a CSV **body that contains A's entry and not B's** (CSV is plain text, so this proves
    scoping end-to-end through the route); plus the mandatory **cross-company 404**. This also closes a
    pre-existing gap: the CSV read endpoint had no cross-company 404 test.
- **Read-only feature → no audit rows** (export mutates nothing; `auditCount()` unaffected).
- **UI wiring** (`ExportDialog`, page swap, i18n) is verified via `pnpm --filter @tt/web typecheck && lint && build`
  (consistent with the repo carrying no component tests). A Playwright e2e for the dialog is a possible
  follow-up, out of v1 scope.
- **Docs:** add **US-89** to `docs/reference/features.md` (Reports section) and `docs/reference/acceptance.md`;
  keep the US-1..N trace at 100%.

## 10. Files touched

- `apps/web/src/app/(authenticated)/reports/page.tsx` — swap 3 buttons → `<ExportDialog>`; pass `members`/`meId`/`isAdmin`/`initial`.
- `apps/web/src/app/(authenticated)/reports/ExportDialog.tsx` — **new** client component (thin wiring).
- `apps/web/src/app/(authenticated)/reports/export-url.ts` — **new** pure logic: `buildExportUrl`, `resolveExportGroupBy`.
- `apps/web/src/app/(authenticated)/reports/date-presets.ts` — **new**; extracted `preset(kind, now)` + `PRESETS` + `PresetKey`.
- `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx` — import presets from the shared module.
- `apps/web/src/components/MultiSelect.tsx` — add optional `onChange?: (ids: string[]) => void` (backward-compatible).
- `apps/web/messages/cs.json` — add `reports.export` dialog strings; remove old button strings.
- `apps/web/tests/services/export-url.test.ts` — **new** unit tests (US-89).
- `apps/web/tests/services/date-presets.test.ts` — **new** unit tests (US-89).
- `apps/web/tests/services/reports-export-pdf-route.test.ts` — extend with US-89 route cases.
- `apps/web/tests/services/reports-export-csv-route.test.ts` — **new** route test (US-89 scoping + cross-company 404).
- `docs/reference/features.md`, `docs/reference/acceptance.md` — record US-89.

## 11. Open questions

None blocking. The only deferred item is the optional per-person filename polish (§7), intentionally out of v1.
