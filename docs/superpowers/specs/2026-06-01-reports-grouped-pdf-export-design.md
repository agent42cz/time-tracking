# Reports overhaul: grouped report + PDF export

- **Date:** 2026-06-01
- **Status:** Implemented
- **New user stories:** US-77 (grouped report view), US-78 (PDF export incl. "last month")
- **Completes:** US-42's PDF leg (CSV already done; XLSX still out of scope)
- **New ADR:** 0010 — pdfmake for server-side PDF export

## 1. Problem

Two tabs feel like duplicates: **Výkaz** (`/timesheet`) and **Reporty** (`/reports`). Under the
hood they differ (personal current-week day-cards vs. an admin-filterable table), but on screen both
are just flat lists of time-entry rows with client / project / description / duration, so they read
as "the same data."

Separately, the app needs a **PDF export for the past month** (US-42 anticipated PDF but it was never
built — only CSV exists today).

Both needs live in the reports area, so they are solved together.

## 2. Goals / non-goals

**Goals**

- Make Reporty a clearly distinct surface: a **grouped report** (group by project / member / day) with
  **per-group subtotals** and a **grand total**, plus **CSV + PDF export**.
- Keep all individual entries visible ("all times there") — organised into groups, not removed.
- Add **PDF export** that respects the current filters/grouping, plus a **one-click "last month" PDF**
  (previous full calendar month, Europe/Prague).
- Render Czech correctly in the PDF.

**Non-goals (YAGNI)**

- XLSX export (the other half of US-42).
- Nested two-level grouping (client → project → subtotals). v1 is single-level grouping.
- Scheduled / emailed reports, logo upload, charts inside the PDF.
- Any change to **Výkaz** or **Dashboard**.

## 3. Information architecture (the de-duplication)

Three admin-facing surfaces, three distinct jobs:

| Surface                      | Question it answers                | Shape                                        | Scope                                               |
| ---------------------------- | ---------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| **Výkaz** (`/timesheet`)     | "What did _I_ do this week?"       | Day cards, edit-focused                      | Always me, current week                             |
| **Reporty** (`/reports`)     | "Build & export a specific report" | Filters → grouped totals + entries → CSV/PDF | Any range/filters; admin = all members, user = self |
| **Dashboard** (`/dashboard`) | "How are we doing?"                | Fixed KPI cards + charts                     | Company-wide, period selector                       |

Reporty stops being a flat clone of Výkaz by reframing its output as grouped totals with subtotals and
a grand total. This is the invoicing / monthly-statement / oversight tool.

## 4. Architecture

Data flow (reuses the existing pattern; export endpoints stay plain route handlers per ADR-0004):

```
filters + groupBy
   │
   ▼
runReport(db, userId, filters)  ──►  ReportRow[]        (existing, unchanged query/scoping)
   │
   ▼
buildGroupedReport(rows, { groupBy })  ──►  GroupedReport   (NEW, pure, no DB)
   │                                            │
   ├──────────────► Reporty page (RSC)          │
   │                 renders groups + totals     │
   ▼                                             ▼
buildReportPdf(report, meta)  ──►  Buffer   (NEW)     rowsToCsv(rows) (existing)
   │                                                       │
   ▼                                                       ▼
GET /api/reports/export.pdf                       GET /api/reports/export.csv (existing)
```

The on-screen view and the PDF consume the **same `GroupedReport`** structure, so subtotals/totals are
computed once and can't drift between screen and export.

### 4.1 Shared report model — `apps/web/src/lib/services/reports.ts`

Extend `ReportRow` with stable IDs so grouping is precise (today it only carries names, which would
merge same-named projects across clients):

```ts
export interface ReportRow {
  // ...existing fields...
  clientId: string | null; // NEW
  projectId: string | null; // NEW
}
```

Add a pure, DB-free builder:

```ts
export type GroupBy = 'project' | 'member' | 'day';

export interface ReportGroup {
  key: string; // projectId | userId | 'YYYY-MM-DD' | 'none'
  label: string; // projectName | userName | dayKey (locale-free; consumer formats day)
  clientName?: string | null; // shown in the header for groupBy === 'project'
  subtotalMs: number;
  rows: ReportRow[];
}

export interface GroupedReport {
  groupBy: GroupBy;
  groups: ReportGroup[];
  grandTotalMs: number;
  rowCount: number;
}

export function buildGroupedReport(
  rows: ReportRow[],
  opts: { groupBy: GroupBy; clampEnd?: Date },
): GroupedReport;
```

Grouping rules:

- `project` → key `projectId ?? 'none'`; rows with no project fall into a "Bez projektu" group;
  groups sorted by `clientName` then `label`.
- `member` → key `userId`; sorted by `userName`.
- `day` → key = `dayKey(startedAt)` in Europe/Prague (`apps/web/src/lib/time-format.ts`); sorted
  chronologically. The builder stays locale-free (label = `YYYY-MM-DD`); the UI/PDF format the date.
- Within each group, rows keep `runReport`'s `startedAt asc` order.
- **Effective duration** per row = `min(endedAt ?? clampEnd ?? now, clampEnd ?? now) − startedAt`
  (ReportRow already carries `startedAt`/`endedAt`). With no `clampEnd` and a finished entry this equals
  the row's `durationMs`; `clampEnd` caps still-running entries (see §7).
- `subtotalMs` = Σ effective duration; `grandTotalMs` = Σ subtotals; `rowCount` = total rows.

`rowsToCsv` stays as-is (CSV remains a flat dump — that's fine for re-import/analysis). The misleading
inline comment "XLSX/PDF use … pdfkit" gets corrected to reference ADR-0010.

### 4.2 Previous-month range — `packages/shared/src/time/index.ts`

`getPeriodRange('month')` returns an **inclusive** end (`endOfMonth` = 23:59:59.999), but `runReport`
filters **half-open** `[from, to)`. To avoid an off-by-a-day/ms boundary bug, add a dedicated helper
returning a clean half-open range:

```ts
import { subMonths } from 'date-fns';

export function getPreviousMonthRange(reference: Date = now()): PeriodRange {
  const local = toAppZone(reference);
  return {
    start: fromAppZone(startOfMonth(subMonths(local, 1))), // 1 May 2026 00:00 Prague
    end: fromAppZone(startOfMonth(local)), // 1 Jun 2026 00:00 Prague (exclusive)
  };
}
```

Uses the existing `now()` provider so tests fix the clock via `setNowProvider`.

### 4.3 PDF builder — `apps/web/src/lib/services/report-pdf.ts` (new)

```ts
export interface ReportPdfMeta {
  companyName: string;
  title: string; // localised, e.g. "Výkaz práce — Květen 2026"
  periodLabel: string; // e.g. "1. 5. – 31. 5. 2026"
  generatedAt: Date;
  groupBy: GroupBy;
  filtersSummary?: string; // human-readable applied filters
  t: Record<string, string>; // localised column/label strings
}

export async function buildReportPdf(report: GroupedReport, meta: ReportPdfMeta): Promise<Buffer>;
```

Uses **pdfmake** server-side via `PdfPrinter` with **embedded Czech-capable fonts** loaded as Buffers
(see §6). Document structure:

- **Header:** company name, title, period, generated timestamp, applied-filters line.
- **Per-group block:** group header (`Client — Project`, member name, or formatted day) + subtotal;
  a table of that group's entries. Columns vary by `groupBy` (omit the grouped dimension), e.g. for
  `project`: Datum · Uživatel · Popis · Štítky · Trvání.
- **Grand total** row at the end.
- **Footer:** page `n / m`.

Returns a `Buffer` (collect `createPdfKitDocument` chunks).

### 4.4 PDF route — `apps/web/src/app/api/reports/export.pdf/route.ts` (new)

Mirrors `export.csv/route.ts`:

- `requireActiveCompany()` → session `userId` + `activeCompanyId`.
- Parse the same filter params as CSV, plus `groupBy` (default `'project'`) and optional
  `preset=lastMonth` → overrides `from`/`to` with `getPreviousMonthRange()`.
- `runReport(...)` → on `!ok` return **404** (cross-company / no-membership safety — see §7).
- `buildGroupedReport(rows, { groupBy, clampEnd: to })` → `buildReportPdf` → respond `application/pdf`
  with a range-derived `Content-Disposition` filename: `vykaz-2026-05.pdf` for a full calendar month /
  `lastMonth`, otherwise `vykaz-2026-05-01_2026-05-15.pdf`.
- Localised strings/title via next-intl loaded server-side for locale `cs`.

### 4.5 Reporty UI — `apps/web/src/app/(authenticated)/reports/`

- `ReportFiltersForm.tsx`: add a **group-by** control (project / member / day) and a **"jen moje"**
  scope toggle (sets `member` = self). Existing date presets (incl. _Minulý měsíc_) stay.
- `page.tsx`: render grouped sections — each group header + subtotal, its entry rows, and a pinned
  **grand-total** row. Extract a `ReportGrouped` view component to keep `page.tsx` focused.
- Export controls: existing **Stáhnout CSV**; new **Stáhnout PDF** (links to `export.pdf?…` with the
  current querystring incl. `groupBy`); new **Výkaz za minulý měsíc (PDF)** → `export.pdf?preset=lastMonth&groupBy=project`.

## 5. Internationalisation

All new UI + PDF strings live in `apps/web/messages/cs.json` (e.g. `reports.groupBy.{project,member,day}`,
`reports.exportPdf`, `reports.exportLastMonth`, `reports.subtotal`, `reports.grandTotal`, and a
`reports.pdf.*` block for the document). No hardcoded Czech in JSX or in the PDF builder. The PDF route
loads `cs` messages server-side and passes them in via `ReportPdfMeta`. Month/day labels via
`Intl.DateTimeFormat('cs-CZ', …)` on Prague-zoned dates.

## 6. Czech fonts (known gotcha)

The PDF base-14 fonts (WinAnsi) don't cover all Czech diacritics (ř, ě, ů…). We **embed a free
Czech-capable TTF** (DejaVu Sans or Noto Sans — both free/OFL; choose one with regular + bold) and load
it into pdfmake as font Buffers.

Deployment caveat to resolve in the plan: Next.js standalone output only ships files it traces. A TTF
read at runtime via `fs` must be guaranteed present in the container — load it through
`require.resolve`/a bundled import, or ensure the Dockerfile copies the font dir. Log the final
mechanism in `docs/gotchas.md` if it bites.

## 7. Edge cases & error handling

- **Cross-company (mandatory 404):** the endpoint reads `activeCompanyId` from the session only — there
  is no company param to forge. `runReport` checks membership and returns `not_found` → route returns 404. Cross-company `member`/`project`/`client` filter IDs are AND-ed with `companyId`, so they yield
  zero rows, never a leak. A 404 test is mandatory (constitution).
- **Running entries (`endedAt = null`):** unlikely in a _past_ month, but if present, counting to "now"
  inflates totals. The route passes `clampEnd = filters.to` (the period end) into `buildGroupedReport`,
  which caps a running entry's effective duration at that instant (see §4.1) so monthly totals stay
  correct.
- **Empty report:** valid PDF with header + "Žádné záznamy" and a zero grand total; no crash.
- **No project / no client:** grouped under "Bez projektu"; blank client cells render as "—".
- **Large reports:** pdfmake paginates automatically; group headers/table headers repeat across pages.
  No artificial row cap; if one is ever added it must be surfaced in the UI (no silent truncation).
- **Exports are reads:** no audit row (consistent with CSV; constitution audits _mutations_ only).
- **Timezone:** all day bucketing and the month range use Europe/Prague via the shared helpers.

## 8. Testing (Vitest + testcontainers; one US per `it`)

- **`buildGroupedReport` (pure unit, no DB):**
  - US-77: group by project → correct subtotals + grand total; "Bez projektu" bucket.
  - US-77: group by member → subtotals per user.
  - US-77: group by day → chronological buckets in Prague tz.
  - US-77: empty input → zero grand total, no groups.
  - US-77: running entry clamped at period end.
- **`getPreviousMonthRange` (unit):** US-78 — reference 2026-06-01 (clock fixed via `setNowProvider`)
  → `[1 May 2026, 1 Jun 2026)` Prague, half-open.
- **PDF route integration (real DB):**
  - US-78: 200, `Content-Type: application/pdf`, `%PDF-` magic bytes, `Content-Disposition` filename.
  - US-78: `preset=lastMonth` filters to the previous calendar month.
  - US-78: **cross-company → 404** (mandatory).
- **Existing CSV round-trip test stays green.**
- **(Optional) Playwright E2E:** Reporty grouped view renders subtotals + grand total; "Výkaz za
  minulý měsíc (PDF)" triggers a download. Note if deferred.
- `pnpm test:trace` must stay at 100% (US-77/US-78 referenced by the tests above).

## 9. Docs & decisions

- **ADR-0010** — pdfmake for server-side PDF export (rationale: declarative tables, auto page breaks,
  footer totals/page numbers, easy custom-font embedding for Czech, no React-19 peer-dependency risk).
  Note it supersedes the earlier inline "pdfkit" assumption.
- **`docs/reference/features.md`** — add US-77, US-78; tick US-42's PDF.
- **`docs/reference/acceptance.md`** — add acceptance evidence rows for US-77/US-78; update the reports
  checkbox to reflect PDF done (XLSX still pending).
- **`docs/architecture/`** — update the reports section to describe the grouped report + exports and the
  three-surface distinction (Výkaz / Reporty / Dashboard).
- **`docs/gotchas.md`** — Czech-font embedding / Next standalone font bundling, if it costs time.

## 10. Decisions captured (from brainstorming)

1. **Tabs:** sharpen the distinction (keep both; give each a clear job) — not merge/delete.
2. **Reporty's new job:** grouped report + export, distinct from Dashboard's fixed KPIs.
3. **Report shape:** supports grouping by client/project, member, and personal (self scope); shows all
   entries with per-group subtotals and a grand total at the bottom.
4. **PDF trigger:** one-click "last month" button (previous full calendar month) + a general
   filter-respecting "Export PDF" button.
5. **Library:** pdfmake.
