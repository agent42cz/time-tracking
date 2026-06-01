# Reports Grouped View + PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Reporty into a grouped report (by project / member / day) with per-group subtotals and a grand total, and add a PDF export (general + one-click "last month"), so Reporty no longer duplicates Výkaz.

**Architecture:** `runReport()` (unchanged query) → `buildGroupedReport()` (new pure function) produces a `GroupedReport` consumed by both the Reporty page and `buildReportPdf()` (pdfmake). A new `/api/reports/export.pdf` route mirrors the existing CSV route. Subtotals/totals are computed once, so screen and PDF can't drift.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript (strict), Prisma 6, pdfmake (server-side PDF), next-intl (cs), Vitest + testcontainers, date-fns.

---

## Conventions for every task

- **Run web tests:** `pnpm --filter @tt/web test` — service/unit tests live in `apps/web/tests/`, vitest `node` env, 60s timeout, glob includes `src/**/*.test.ts(x)` and `tests/**/*.test.ts`.
- **Run shared tests:** `pnpm --filter @tt/shared test` — tests are co-located (`src/**/*.test.ts`), pure (no DB).
- **DB-backed tests** use `getTestPrisma`/`stopTestPrisma`/`withTx` from `@tt/db/test` (real Postgres via testcontainers — never mock the DB). `withTx` rolls back after each test.
- **One user story per `it`**, US ID in the name, e.g. `it('US-77: ...')`.
- **i18n decision:** genuinely _new_ user-facing strings (group-by control, subtotal/grand-total labels, the new buttons, the PDF document) go into `apps/web/messages/cs.json` and are read via next-intl. Column headers that already exist hardcoded in `reports/page.tsx` ("Datum", "Uživatel", …) are _relocated as-is_ (not re-keyed) to avoid converting the whole page — this matches the existing reports/dashboard surface, which is hardcoded. `buildReportPdf` stays pure: it receives all strings via `meta.t`, so it needs no next-intl import and is unit-testable.
- **Font decision:** embed DejaVu Sans (OFL, full Czech coverage) — base-14 PDF fonts can't render ř/ě/ů. Loaded from `apps/web/src/assets/fonts/` via `fs` at `process.cwd()` and shipped to the standalone build via `outputFileTracingIncludes` (verified Next 15 config).
- **Commit** at the end of each task. Commit messages end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Branch is already `feat/reports-grouped-pdf`.

---

## File map

| File                                                               | Action | Responsibility                                                                                                                 |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/package.json`                                            | modify | add `pdfmake` + `@types/pdfmake`                                                                                               |
| `apps/web/next.config.mjs`                                         | modify | externalize `pdfmake`; trace font files for the PDF route                                                                      |
| `apps/web/src/assets/fonts/DejaVuSans.ttf`, `-Bold.ttf`, `LICENSE` | create | embedded Czech-capable font                                                                                                    |
| `apps/web/src/types/pdfmake.d.ts`                                  | create | type shim for the server `PdfPrinter` default import                                                                           |
| `packages/shared/src/time/index.ts`                                | modify | `getPreviousMonthRange()`                                                                                                      |
| `packages/shared/src/time/time.test.ts`                            | modify | test for the above                                                                                                             |
| `apps/web/src/lib/services/reports.ts`                             | modify | add `clientId`/`projectId` to `ReportRow`; add `GroupBy`/`ReportGroup`/`GroupedReport`/`buildGroupedReport`; fix stale comment |
| `apps/web/tests/services/dashboard-reports.test.ts`                | modify | US-77 runReport-ids test                                                                                                       |
| `apps/web/tests/services/report-grouped.test.ts`                   | create | `buildGroupedReport` pure tests                                                                                                |
| `apps/web/messages/cs.json`                                        | modify | new `reports.*` strings                                                                                                        |
| `apps/web/src/lib/services/report-pdf.ts`                          | create | `buildReportPdf()`                                                                                                             |
| `apps/web/tests/services/report-pdf.test.ts`                       | create | PDF buffer test                                                                                                                |
| `apps/web/src/app/api/reports/export.pdf/route.ts`                 | create | PDF route handler                                                                                                              |
| `apps/web/tests/services/reports-export-pdf-route.test.ts`         | create | route 404 + happy-path test                                                                                                    |
| `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx`   | modify | group-by control + "jen moje" toggle                                                                                           |
| `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx`       | create | grouped sections + subtotals + grand total                                                                                     |
| `apps/web/src/app/(authenticated)/reports/page.tsx`                | modify | wire groupBy, render `ReportGrouped`, add PDF buttons                                                                          |
| `docs/decisions/0010-pdfmake-for-pdf-export.md`                    | create | ADR                                                                                                                            |
| `docs/reference/features.md`, `acceptance.md`                      | modify | US-77, US-78                                                                                                                   |
| `docs/architecture/*`, `docs/gotchas.md`                           | modify | reflect live system + font gotcha                                                                                              |

---

## Task 0: Dependencies, font asset, config, type shim

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.mjs`
- Create: `apps/web/src/assets/fonts/DejaVuSans.ttf`, `apps/web/src/assets/fonts/DejaVuSans-Bold.ttf`, `apps/web/src/assets/fonts/LICENSE`
- Create: `apps/web/src/types/pdfmake.d.ts`

- [ ] **Step 1: Install pdfmake + types**

Run (pinned to the stable 0.2 line, whose `PdfPrinter` server API this plan uses):

```bash
pnpm --filter @tt/web add pdfmake@^0.2.10
pnpm --filter @tt/web add -D @types/pdfmake@^0.2.9
```

- [ ] **Step 2: Vendor the DejaVu Sans fonts**

DejaVu Sans is OFL-licensed and covers Czech. Download Regular + Bold + the license into the assets dir:

```bash
mkdir -p "apps/web/src/assets/fonts"
curl -fsSL -o "apps/web/src/assets/fonts/DejaVuSans.ttf"      "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/ttf/DejaVuSans.ttf"
curl -fsSL -o "apps/web/src/assets/fonts/DejaVuSans-Bold.ttf" "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/ttf/DejaVuSans-Bold.ttf"
curl -fsSL -o "apps/web/src/assets/fonts/LICENSE"             "https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/LICENSE"
```

Verify they are real TrueType files (each Regular/Bold should be ~300–760 KB), not an HTML error page:

```bash
file "apps/web/src/assets/fonts/DejaVuSans.ttf" "apps/web/src/assets/fonts/DejaVuSans-Bold.ttf"
```

Expected: each reports `TrueType Font data` (or `TrueType font`). If `curl` failed/returned HTML, fetch the two `.ttf` files from any DejaVu mirror and place them at those exact paths.

- [ ] **Step 3: Externalize pdfmake and trace the font files**

Replace `apps/web/next.config.mjs` with:

```javascript
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client', 'argon2', 'pdfmake'],
  poweredByHeader: false,
  experimental: {
    typedRoutes: false,
  },
  // Ship the embedded PDF fonts into the standalone build for the PDF route.
  outputFileTracingIncludes: {
    '/api/reports/export.pdf': ['./src/assets/fonts/**/*'],
  },
  // Tell webpack to resolve `.js` imports against `.ts/.tsx` source files —
  // matches Vitest/Vite behavior so the same code compiles in both.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 4: Add the pdfmake server type shim**

`@types/pdfmake` types the prebuilt client bundle, not the bare `pdfmake` default import used server-side. Create `apps/web/src/types/pdfmake.d.ts`:

```ts
declare module 'pdfmake' {
  import type { TDocumentDefinitions } from 'pdfmake/interfaces';

  interface PdfKitDocument {
    on(event: 'data', cb: (chunk: Buffer) => void): void;
    on(event: 'end', cb: () => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    end(): void;
  }

  type FontSource = Buffer | string;
  interface FontFace {
    normal: FontSource;
    bold?: FontSource;
    italics?: FontSource;
    bolditalics?: FontSource;
  }

  export default class PdfPrinter {
    constructor(fonts: Record<string, FontFace>);
    createPdfKitDocument(docDefinition: TDocumentDefinitions): PdfKitDocument;
  }
}
```

- [ ] **Step 5: Verify install + types**

Run:

```bash
pnpm install
pnpm --filter @tt/web typecheck
```

Expected: install succeeds; typecheck passes (no usages yet, so this just confirms the shim and deps resolve).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/next.config.mjs apps/web/src/assets/fonts apps/web/src/types/pdfmake.d.ts pnpm-lock.yaml
git commit -m "build(reports): add pdfmake + DejaVu font for PDF export" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: `getPreviousMonthRange` (previous calendar month, half-open, Prague)

**Files:**

- Modify: `packages/shared/src/time/index.ts`
- Test: `packages/shared/src/time/time.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/shared/src/time/time.test.ts` (import `getPreviousMonthRange` and `setNowProvider` — extend the existing import from `'./index.js'` / `'./index'` to match the file's current import style):

```ts
it('getPreviousMonthRange returns the previous full calendar month as a half-open Prague range', () => {
  setNowProvider(() => new Date('2026-06-01T10:00:00Z'));
  const r = getPreviousMonthRange();
  // 1 May 2026 00:00 Prague (CEST = UTC+2) === 2026-04-30T22:00:00Z
  expect(r.start.toISOString()).toBe('2026-04-30T22:00:00.000Z');
  // exclusive end = 1 Jun 2026 00:00 Prague === 2026-05-31T22:00:00Z
  expect(r.end.toISOString()).toBe('2026-05-31T22:00:00.000Z');
  setNowProvider(null);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @tt/shared test`
Expected: FAIL — `getPreviousMonthRange is not a function` / not exported.

- [ ] **Step 3: Implement**

In `packages/shared/src/time/index.ts`, add `subMonths` to the date-fns import and append the function after `getPeriodRange`:

```ts
// (extend the existing date-fns import)
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';

// `getPeriodRange('month')` returns an inclusive end (endOfMonth, 23:59:59.999),
// but reports filter half-open [from, to). This helper returns a clean half-open
// previous-calendar-month range so the "last month" PDF includes the whole month.
export function getPreviousMonthRange(reference: Date = now()): PeriodRange {
  const local = toAppZone(reference);
  return {
    start: fromAppZone(startOfMonth(subMonths(local, 1))),
    end: fromAppZone(startOfMonth(local)),
  };
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter @tt/shared test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/time/index.ts packages/shared/src/time/time.test.ts
git commit -m "feat(time): add getPreviousMonthRange helper" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `clientId`/`projectId` to `ReportRow`

Grouping must key on IDs, not names (two projects named "Web" under different clients must not merge).

**Files:**

- Modify: `apps/web/src/lib/services/reports.ts:23-34` (interface) and `:88-99` (mapping)
- Test: `apps/web/tests/services/dashboard-reports.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe('reports', ...)` block in `dashboard-reports.test.ts`:

```ts
it('US-77: runReport rows carry clientId and projectId for grouping', async () => {
  await withTx(async (tx) => {
    const w = await buildWorld(tx, 'us77ids');
    const r = await runReport(tx, w.admin, { companyId: w.company });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acme = r.value.find((row) => row.clientName === 'Acme');
    expect(acme?.clientId).toBe(w.clientA);
    expect(acme?.projectId).toBe(w.projectA);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @tt/web test dashboard-reports`
Expected: FAIL — `clientId`/`projectId` are `undefined` (TS may also error on the property access).

- [ ] **Step 3: Implement**

In `apps/web/src/lib/services/reports.ts`, extend the `ReportRow` interface:

```ts
export interface ReportRow {
  id: string;
  userId: string;
  userName: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  description: string;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number;
  tags: { id: string; name: string }[];
}
```

And in the `rows.map(...)` return, add the two IDs:

```ts
      id: r.id,
      userId: r.userId,
      userName: r.user.fullName,
      clientId: r.clientId,
      clientName: r.client?.name ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `pnpm --filter @tt/web test dashboard-reports`
Expected: PASS (existing reports tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/reports.ts apps/web/tests/services/dashboard-reports.test.ts
git commit -m "feat(reports): expose clientId/projectId on ReportRow" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `buildGroupedReport` (pure grouping + subtotals + grand total)

**Files:**

- Modify: `apps/web/src/lib/services/reports.ts` (append types + function)
- Test: `apps/web/tests/services/report-grouped.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/services/report-grouped.test.ts`:

```ts
/** Phase 12 — grouped report builder. Covers US-77. */
import { describe, expect, it } from 'vitest';
import { buildGroupedReport, type ReportRow } from '../../src/lib/services/reports.js';

const H = 60 * 60 * 1000;

function row(over: Partial<ReportRow>): ReportRow {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    userName: 'Alice',
    clientId: 'c1',
    clientName: 'Acme',
    projectId: 'p1',
    projectName: 'Web',
    description: 'work',
    startedAt: new Date('2026-05-04T08:00:00Z'),
    endedAt: new Date('2026-05-04T10:00:00Z'),
    durationMs: 2 * H,
    tags: [],
    ...over,
  };
}

describe('buildGroupedReport', () => {
  it('US-77: groups by project with per-project subtotals and a grand total', () => {
    const rows = [
      row({ projectId: 'p1', projectName: 'Web', clientName: 'Acme', durationMs: 2 * H }),
      row({ projectId: 'p1', projectName: 'Web', clientName: 'Acme', durationMs: 1 * H }),
      row({ projectId: 'p2', projectName: 'API', clientName: 'Beta', durationMs: 3 * H }),
    ];
    const g = buildGroupedReport(rows, { groupBy: 'project' });
    expect(g.groups).toHaveLength(2);
    const web = g.groups.find((x) => x.key === 'p1');
    expect(web?.subtotalMs).toBe(3 * H);
    expect(web?.clientName).toBe('Acme');
    expect(g.grandTotalMs).toBe(6 * H);
    expect(g.rowCount).toBe(3);
  });

  it('US-77: rows without a project fall into a single "Bez projektu" group', () => {
    const g = buildGroupedReport([row({ projectId: null, projectName: null, durationMs: 1 * H })], {
      groupBy: 'project',
    });
    expect(g.groups[0]!.key).toBe('none');
    expect(g.groups[0]!.label).toBe('Bez projektu');
  });

  it('US-77: groups by member', () => {
    const rows = [
      row({ userId: 'u1', userName: 'Alice', durationMs: 2 * H }),
      row({ userId: 'u2', userName: 'Bob', durationMs: 1 * H }),
      row({ userId: 'u1', userName: 'Alice', durationMs: 1 * H }),
    ];
    const g = buildGroupedReport(rows, { groupBy: 'member' });
    expect(g.groups.map((x) => x.key)).toEqual(['u1', 'u2']); // sorted by name
    expect(g.groups.find((x) => x.key === 'u1')?.subtotalMs).toBe(3 * H);
  });

  it('US-77: groups by Prague day, bucketing a cross-midnight entry by its start day', () => {
    // 2026-05-01 22:30 UTC = 2026-05-02 00:30 Prague (CEST).
    const g = buildGroupedReport(
      [row({ startedAt: new Date('2026-05-01T22:30:00Z'), durationMs: 1 * H })],
      { groupBy: 'day' },
    );
    expect(g.groups[0]!.key).toBe('2026-05-02');
  });

  it('US-77: empty input yields no groups and a zero grand total', () => {
    const g = buildGroupedReport([], { groupBy: 'project' });
    expect(g.groups).toEqual([]);
    expect(g.grandTotalMs).toBe(0);
    expect(g.rowCount).toBe(0);
  });

  it('US-77: a still-running entry is clamped at clampEnd for totals', () => {
    const periodEnd = new Date('2026-06-01T00:00:00Z');
    const g = buildGroupedReport(
      [
        row({
          startedAt: new Date('2026-05-31T22:00:00Z'),
          endedAt: null,
          durationMs: 999 * H, // would-be runaway if not clamped
        }),
      ],
      { groupBy: 'project', clampEnd: periodEnd },
    );
    expect(g.grandTotalMs).toBe(2 * H); // 22:00 -> 24:00 = 2h
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @tt/web test report-grouped`
Expected: FAIL — `buildGroupedReport` not exported.

- [ ] **Step 3: Implement**

Append to `apps/web/src/lib/services/reports.ts` (add the `toAppZone` import at the top: `import { toAppZone } from '@tt/shared/time';`):

```ts
export type GroupBy = 'project' | 'member' | 'day';

export interface ReportGroup {
  key: string;
  label: string;
  clientName: string | null;
  subtotalMs: number;
  rows: ReportRow[];
}

export interface GroupedReport {
  groupBy: GroupBy;
  groups: ReportGroup[];
  grandTotalMs: number;
  rowCount: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Prague-local YYYY-MM-DD bucket (Coolify runs UTC; bucket by the day the user lived).
function pragueDayKey(d: Date): string {
  const z = toAppZone(d);
  return `${z.getFullYear()}-${pad2(z.getMonth() + 1)}-${pad2(z.getDate())}`;
}

function effectiveMs(r: ReportRow, clampEnd?: Date): number {
  const rawEnd = r.endedAt ?? clampEnd ?? new Date();
  const end = clampEnd && rawEnd.getTime() > clampEnd.getTime() ? clampEnd : rawEnd;
  return Math.max(0, end.getTime() - r.startedAt.getTime());
}

export function buildGroupedReport(
  rows: ReportRow[],
  opts: { groupBy: GroupBy; clampEnd?: Date },
): GroupedReport {
  const { groupBy, clampEnd } = opts;
  const map = new Map<string, ReportGroup>();

  for (const r of rows) {
    let key: string;
    let label: string;
    let clientName: string | null;
    if (groupBy === 'project') {
      key = r.projectId ?? 'none';
      label = r.projectName ?? 'Bez projektu';
      clientName = r.clientName;
    } else if (groupBy === 'member') {
      key = r.userId;
      label = r.userName;
      clientName = null;
    } else {
      key = pragueDayKey(r.startedAt);
      label = key;
      clientName = null;
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, clientName, subtotalMs: 0, rows: [] };
      map.set(key, g);
    }
    g.subtotalMs += effectiveMs(r, clampEnd);
    g.rows.push(r);
  }

  const groups = [...map.values()].sort((a, b) => {
    if (groupBy === 'project') {
      return (
        (a.clientName ?? '').localeCompare(b.clientName ?? '', 'cs') ||
        a.label.localeCompare(b.label, 'cs')
      );
    }
    if (groupBy === 'member') return a.label.localeCompare(b.label, 'cs');
    return a.key.localeCompare(b.key); // 'YYYY-MM-DD' sorts chronologically
  });

  return {
    groupBy,
    groups,
    grandTotalMs: groups.reduce((s, g) => s + g.subtotalMs, 0),
    rowCount: rows.length,
  };
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `pnpm --filter @tt/web test report-grouped`
Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/reports.ts apps/web/tests/services/report-grouped.test.ts
git commit -m "feat(reports): add buildGroupedReport with subtotals and grand total" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: i18n strings

**Files:**

- Modify: `apps/web/messages/cs.json` (the `reports` block, lines ~102-109)

- [ ] **Step 1: Replace the `reports` block**

Replace the existing `"reports": { ... }` object with:

```json
  "reports": {
    "title": "Reporty",
    "filters": "Filtry",
    "groupBy": {
      "label": "Seskupit podle",
      "project": "Projektu",
      "member": "Člena",
      "day": "Dne"
    },
    "onlyMine": "Jen moje záznamy",
    "subtotal": "Mezisoučet",
    "grandTotal": "Celkem",
    "export": {
      "csv": "Stáhnout CSV",
      "xlsx": "Export XLSX",
      "pdf": "Stáhnout PDF",
      "lastMonth": "Výkaz za minulý měsíc (PDF)"
    },
    "pdf": {
      "title": "Výkaz práce",
      "user": "Uživatel",
      "description": "Popis",
      "tags": "Štítky",
      "duration": "Trvání",
      "subtotal": "Mezisoučet",
      "grandTotal": "Celkem",
      "generatedAt": "Vygenerováno",
      "groupedBy": "Seskupeno podle",
      "noEntries": "Žádné záznamy"
    }
  },
```

- [ ] **Step 2: Verify JSON is valid**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('apps/web/messages/cs.json','utf8')); console.log('cs.json OK')"
```

Expected: `cs.json OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/cs.json
git commit -m "feat(reports): add cs strings for grouping + PDF export" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `buildReportPdf` (pdfmake)

**Files:**

- Create: `apps/web/src/lib/services/report-pdf.ts`
- Test: `apps/web/tests/services/report-pdf.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/report-pdf.test.ts`:

```ts
/** Phase 12 — PDF builder. Covers US-78. */
import { describe, expect, it } from 'vitest';
import { buildReportPdf, type ReportPdfStrings } from '../../src/lib/services/report-pdf.js';
import { buildGroupedReport, type ReportRow } from '../../src/lib/services/reports.js';

const H = 60 * 60 * 1000;
const STR: ReportPdfStrings = {
  user: 'Uživatel',
  description: 'Popis',
  tags: 'Štítky',
  duration: 'Trvání',
  subtotal: 'Mezisoučet',
  grandTotal: 'Celkem',
  generatedAt: 'Vygenerováno',
  groupedBy: 'Seskupeno podle',
  noEntries: 'Žádné záznamy',
  groupLabel: 'Projektu',
};

function sampleRow(): ReportRow {
  return {
    id: 'e1',
    userId: 'u1',
    userName: 'Žluťoučký kůň', // exercises Czech glyphs
    clientId: 'c1',
    clientName: 'Acme',
    projectId: 'p1',
    projectName: 'Příliš žluťoučký projekt',
    description: 'Ladění úložiště',
    startedAt: new Date('2026-05-04T08:00:00Z'),
    endedAt: new Date('2026-05-04T10:00:00Z'),
    durationMs: 2 * H,
    tags: [{ id: 't1', name: 'schůzka' }],
  };
}

function meta() {
  return {
    companyName: 'Agentura 42',
    title: 'Výkaz práce',
    periodLabel: '1. 5. 2026 – 31. 5. 2026',
    generatedAt: new Date('2026-06-01T09:00:00Z'),
    groupBy: 'project' as const,
    t: STR,
  };
}

describe('buildReportPdf', () => {
  it('US-78: renders a non-empty PDF for a grouped report', async () => {
    const report = buildGroupedReport([sampleRow()], { groupBy: 'project' });
    const buf = await buildReportPdf(report, meta());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-'); // valid PDF magic bytes
  });

  it('US-78: renders a valid PDF for an empty report', async () => {
    const report = buildGroupedReport([], { groupBy: 'project' });
    const buf = await buildReportPdf(report, meta());
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @tt/web test report-pdf`
Expected: FAIL — module `report-pdf` not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/services/report-pdf.ts`:

```ts
/**
 * Server-side PDF rendering for the grouped report (US-78). Pure w.r.t. i18n:
 * all user-facing strings arrive via `meta`, so this is unit-testable without
 * next-intl. Uses pdfmake's PdfPrinter (0.2 API) with an embedded DejaVu Sans
 * font — base-14 PDF fonts can't render Czech diacritics (ř/ě/ů).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, TableCell, Content } from 'pdfmake/interfaces';
import { toAppZone } from '@tt/shared/time';
import type { GroupedReport, GroupBy } from './reports.js';

// process.cwd() is the Next.js app dir (`apps/web`) in dev, `next start`, and
// vitest; the fonts are traced into the standalone build via next.config.mjs.
const FONT_DIR = join(process.cwd(), 'src/assets/fonts');
const printer = new PdfPrinter({
  DejaVu: {
    normal: readFileSync(join(FONT_DIR, 'DejaVuSans.ttf')),
    bold: readFileSync(join(FONT_DIR, 'DejaVuSans-Bold.ttf')),
  },
});

export interface ReportPdfStrings {
  user: string;
  description: string;
  tags: string;
  duration: string;
  subtotal: string;
  grandTotal: string;
  generatedAt: string;
  groupedBy: string;
  noEntries: string;
  groupLabel: string; // localized name of the active grouping (e.g. "Projektu")
}

export interface ReportPdfMeta {
  companyName: string;
  title: string;
  periodLabel: string;
  generatedAt: Date;
  groupBy: GroupBy;
  t: ReportPdfStrings;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

function hm(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function dateTime(d: Date): string {
  const z = toAppZone(d);
  return `${pad2(z.getDate())}.${pad2(z.getMonth() + 1)}.${z.getFullYear()} ${pad2(z.getHours())}:${pad2(z.getMinutes())}`;
}

export function buildReportPdf(report: GroupedReport, meta: ReportPdfMeta): Promise<Buffer> {
  const { t } = meta;
  const showUser = meta.groupBy !== 'member';
  const content: Content[] = [
    { text: meta.companyName, style: 'company' },
    { text: meta.title, style: 'title' },
    { text: meta.periodLabel, style: 'period' },
    { text: `${t.groupedBy}: ${t.groupLabel}`, style: 'metaLine' },
    {
      text: `${t.generatedAt}: ${dateTime(meta.generatedAt)}`,
      style: 'metaLine',
      margin: [0, 0, 0, 12],
    },
  ];

  if (report.rowCount === 0) {
    content.push({ text: t.noEntries, italics: true, margin: [0, 12, 0, 0] });
  } else {
    for (const g of report.groups) {
      const heading =
        meta.groupBy === 'project' && g.clientName ? `${g.clientName} → ${g.label}` : g.label;
      content.push({ text: heading, style: 'group', margin: [0, 10, 0, 4] });

      const header: TableCell[] = [{ text: 'Datum', style: 'th' }];
      if (showUser) header.push({ text: t.user, style: 'th' });
      header.push({ text: t.description, style: 'th' });
      header.push({ text: t.tags, style: 'th' });
      header.push({ text: t.duration, style: 'th', alignment: 'right' });
      const body: TableCell[][] = [header];

      for (const r of g.rows) {
        const cells: TableCell[] = [{ text: dateTime(r.startedAt) }];
        if (showUser) cells.push({ text: r.userName });
        cells.push({ text: r.description });
        cells.push({ text: r.tags.map((x) => x.name).join(', ') });
        cells.push({ text: hm(r.durationMs), alignment: 'right' });
        body.push(cells);
      }

      const span = showUser ? 4 : 3;
      const subtotal: TableCell[] = [
        { text: t.subtotal, colSpan: span, bold: true, alignment: 'right' },
      ];
      for (let i = 1; i < span; i++) subtotal.push({ text: '' });
      subtotal.push({ text: hm(g.subtotalMs), bold: true, alignment: 'right' });
      body.push(subtotal);

      content.push({
        table: {
          headerRows: 1,
          widths: showUser ? ['auto', 'auto', '*', 'auto', 'auto'] : ['auto', '*', 'auto', 'auto'],
          body,
        },
        layout: 'lightHorizontalLines',
      });
    }
    content.push({
      text: `${t.grandTotal}: ${hm(report.grandTotalMs)}`,
      style: 'grand',
      alignment: 'right',
      margin: [0, 14, 0, 0],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    content,
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'DejaVu', fontSize: 9 },
    styles: {
      company: { fontSize: 10, color: '#666666' },
      title: { fontSize: 18, bold: true, margin: [0, 2, 0, 2] },
      period: { fontSize: 11, color: '#333333' },
      metaLine: { fontSize: 8, color: '#888888' },
      group: { fontSize: 12, bold: true },
      th: { bold: true, fillColor: '#f4f4f5' },
      grand: { fontSize: 12, bold: true },
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'center',
      fontSize: 8,
      color: '#888888',
      margin: [0, 10, 0, 0],
    }),
  };

  const pdf = printer.createPdfKitDocument(docDefinition);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.end();
  });
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `pnpm --filter @tt/web test report-pdf`
Expected: PASS (both). If it fails to find the font, re-check Task 0 Step 2 produced real `.ttf` files at `apps/web/src/assets/fonts/`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/report-pdf.ts apps/web/tests/services/report-pdf.test.ts
git commit -m "feat(reports): render grouped report to PDF via pdfmake" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `/api/reports/export.pdf` route + route test

**Files:**

- Create: `apps/web/src/app/api/reports/export.pdf/route.ts`
- Test: `apps/web/tests/services/reports-export-pdf-route.test.ts`

> The existing CSV route is a thin, untested wrapper; cross-company safety is enforced by `runReport` (which returns `not_found` → the route returns 404). We add a real route test anyway (mandatory cross-company 404 for read endpoints), mocking the session/prisma against the testcontainers DB and stubbing next-intl.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/services/reports-export-pdf-route.test.ts`:

```ts
/** Phase 12 — PDF export route. Covers US-78 (incl. mandatory cross-company 404). */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { setNowProvider } from '@tt/shared/time';
import { createCompany } from '../../src/lib/services/companies.js';
import { createClient, createProject } from '../../src/lib/services/catalog.js';

// Mutable holder the mocked session reads from (vi.mock factories are hoisted).
const ctx = vi.hoisted(() => ({
  db: null as unknown as Prisma.TransactionClient,
  session: null as unknown as {
    userId: string;
    activeCompanyId: string;
    activeRole: 'admin' | 'user';
  },
}));

vi.mock('@/lib/session', () => ({
  prisma: () => ctx.db,
  requireActiveCompany: async () => ctx.session,
}));
// Stub next-intl so the route doesn't need request context; returns the key.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

// Import the route AFTER the mocks are registered.
const { GET } = await import('../../src/app/api/reports/export.pdf/route.js');

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
  setNowProvider(null);
});
beforeEach(() => {
  setNowProvider(() => new Date('2026-06-01T10:00:00Z'));
});

function reqUrl(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/reports/export.pdf?${qs}`);
}

describe('GET /api/reports/export.pdf', () => {
  it('US-78: exports last month as a PDF', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const admin = await tx.user.create({ data: { email: 'pdf-a@x.test', fullName: 'A' } });
      const company = await createCompany(tx, { name: 'PDF Co', createdByUserId: admin.id });
      const client = await createClient(tx, admin.id, { companyId: company.id, name: 'Acme' });
      if (!client.ok) throw new Error('setup');
      const project = await createProject(tx, admin.id, { clientId: client.value.id, name: 'Web' });
      if (!project.ok) throw new Error('setup');
      await tx.timeEntry.create({
        data: {
          userId: admin.id,
          companyId: company.id,
          clientId: client.value.id,
          projectId: project.value.id,
          description: 'Práce v květnu',
          startedAt: new Date('2026-05-10T08:00:00Z'),
          endedAt: new Date('2026-05-10T11:00:00Z'),
        },
      });
      ctx.session = { userId: admin.id, activeCompanyId: company.id, activeRole: 'admin' };

      const res = await GET(reqUrl('preset=lastMonth&groupBy=project'));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('vykaz-2026-05.pdf');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  it('US-78: returns 404 when the active company is one the user does not belong to', async () => {
    await withTx(async (tx) => {
      ctx.db = tx;
      const outsider = await tx.user.create({ data: { email: 'pdf-o@x.test', fullName: 'O' } });
      const founder = await tx.user.create({ data: { email: 'pdf-f@x.test', fullName: 'F' } });
      const foreign = await createCompany(tx, { name: 'Foreign', createdByUserId: founder.id });
      // Outsider has no membership in `foreign` but the session claims it active.
      ctx.session = { userId: outsider.id, activeCompanyId: foreign.id, activeRole: 'admin' };

      const res = await GET(reqUrl('preset=lastMonth'));
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @tt/web test reports-export-pdf-route`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/reports/export.pdf/route.ts`:

```ts
import type { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { buildGroupedReport, runReport, type GroupBy } from '@/lib/services/reports';
import { buildReportPdf, type ReportPdfStrings } from '@/lib/services/report-pdf';
import { getPreviousMonthRange, toAppZone } from '@tt/shared/time';

export const dynamic = 'force-dynamic';

function parseGroupBy(v: string | null): GroupBy {
  return v === 'member' || v === 'day' ? v : 'project';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
function ymdPrague(d: Date): { y: number; m: number; day: number } {
  const z = toAppZone(d);
  return { y: z.getFullYear(), m: z.getMonth() + 1, day: z.getDate() };
}

function periodLabel(from?: Date, to?: Date): string {
  if (!from && !to) return 'Vše';
  const f = from ? ((p) => `${p.day}. ${p.m}. ${p.y}`)(ymdPrague(from)) : '…';
  // `to` is the exclusive end; show the last included day.
  const t = to ? ((p) => `${p.day}. ${p.m}. ${p.y}`)(ymdPrague(new Date(to.getTime() - 1))) : '…';
  return `${f} – ${t}`;
}

function filename(from?: Date, to?: Date): string {
  if (from && to) {
    const a = ymdPrague(from);
    const lastDay = ymdPrague(new Date(to.getTime() - 1));
    // Whole calendar month → vykaz-YYYY-MM.pdf
    if (a.day === 1 && lastDay.y === a.y && lastDay.m === a.m) {
      const next = ymdPrague(to);
      const wholeMonth = next.day === 1 && (next.m === a.m + 1 || (a.m === 12 && next.m === 1));
      if (wholeMonth) return `vykaz-${a.y}-${pad2(a.m)}.pdf`;
    }
    return `vykaz-${a.y}-${pad2(a.m)}-${pad2(a.day)}_${lastDay.y}-${pad2(lastDay.m)}-${pad2(lastDay.day)}.pdf`;
  }
  const today = ymdPrague(new Date());
  return `vykaz-${today.y}-${pad2(today.m)}-${pad2(today.day)}.pdf`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const s = await requireActiveCompany();
  const sp = req.nextUrl.searchParams;
  const groupBy = parseGroupBy(sp.get('groupBy'));

  let from = sp.get('from') ? new Date(sp.get('from')!) : undefined;
  let to = sp.get('to') ? new Date(sp.get('to')!) : undefined;
  if (sp.get('preset') === 'lastMonth') {
    const r = getPreviousMonthRange();
    from = r.start;
    to = r.end;
  }

  const result = await runReport(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    from,
    to,
    clientIds: sp.getAll('client'),
    projectIds: sp.getAll('project'),
    memberIds: sp.getAll('member'),
    tagIds: sp.getAll('tag'),
    tagsMode: sp.get('tagsMode') === 'and' ? 'and' : 'or',
    search: sp.get('search') ?? undefined,
  });
  if (!result.ok) return new Response('not found', { status: 404 });

  const report = buildGroupedReport(result.value, { groupBy, clampEnd: to });

  const t = await getTranslations({ locale: 'cs', namespace: 'reports' });
  const company = await prisma().company.findUnique({
    where: { id: s.activeCompanyId },
    select: { name: true },
  });
  const groupLabel =
    groupBy === 'member'
      ? t('groupBy.member')
      : groupBy === 'day'
        ? t('groupBy.day')
        : t('groupBy.project');
  const strings: ReportPdfStrings = {
    user: t('pdf.user'),
    description: t('pdf.description'),
    tags: t('pdf.tags'),
    duration: t('pdf.duration'),
    subtotal: t('pdf.subtotal'),
    grandTotal: t('pdf.grandTotal'),
    generatedAt: t('pdf.generatedAt'),
    groupedBy: t('pdf.groupedBy'),
    noEntries: t('pdf.noEntries'),
    groupLabel,
  };

  const pdf = await buildReportPdf(report, {
    companyName: company?.name ?? '',
    title: t('pdf.title'),
    periodLabel: periodLabel(from, to),
    generatedAt: new Date(),
    groupBy,
    t: strings,
  });

  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename(from, to)}"`,
    },
  });
}
```

> Note: if `getTranslations({ locale: 'cs', namespace: 'reports' })` ever throws outside request context at runtime, swap it for a direct catalog read: `import cs from '@/../messages/cs.json'` and read `cs.reports.*`. The strings still live only in `cs.json`. The route test stubs next-intl, so it is unaffected either way.

- [ ] **Step 4: Run to confirm passing**

Run: `pnpm --filter @tt/web test reports-export-pdf-route`
Expected: PASS (both the 200 export and the 404).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/reports/export.pdf/route.ts" apps/web/tests/services/reports-export-pdf-route.test.ts
git commit -m "feat(reports): add PDF export route with last-month preset" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Reporty filters — group-by control + "jen moje" toggle

**Files:**

- Modify: `apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx`

This is a client component; it uses `useTranslations('reports')` (the established client-component i18n pattern). The form is `method="get"`, so the new controls submit as query params (`groupBy`, and `member=<meId>` when "jen moje" is on).

- [ ] **Step 1: Extend the props + initial types**

In `ReportFiltersForm.tsx`, add to `interface Initial`:

```ts
groupBy: 'project' | 'member' | 'day';
```

Add to `interface Props`:

```ts
meId: string;
```

Add the next-intl import near the top:

```ts
import { useTranslations } from 'next-intl';
```

- [ ] **Step 2: Add state + controls**

Inside the component body, after the existing `useState` hooks, add:

```ts
const t = useTranslations('reports');
const [groupBy, setGroupBy] = useState(initial.groupBy);
const [onlyMine, setOnlyMine] = useState(
  initial.memberIds.length === 1 && initial.memberIds[0] === meId,
);

const GROUP_OPTIONS: { key: 'project' | 'member' | 'day'; label: string }[] = [
  { key: 'project', label: t('groupBy.project') },
  { key: 'member', label: t('groupBy.member') },
  { key: 'day', label: t('groupBy.day') },
];
```

Then, inside the `<form>`, immediately after the "Date presets + custom range" `</div>` block, insert the group-by + scope controls:

```tsx
{
  /* Group-by + scope */
}
<div className="flex flex-wrap items-center gap-4">
  <div className="space-y-2">
    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {t('groupBy.label')}
    </p>
    <div className="flex flex-wrap items-center gap-2">
      {GROUP_OPTIONS.map((o) => {
        const active = groupBy === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => setGroupBy(o.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
    <input type="hidden" name="groupBy" value={groupBy} />
  </div>
  {isAdmin ? (
    <label className="flex items-center gap-2 self-end pb-1 text-sm text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
      {t('onlyMine')}
      {onlyMine ? <input type="hidden" name="member" value={meId} /> : null}
    </label>
  ) : null}
</div>;
```

When "jen moje" is checked, the member MultiSelect below should be ignored. Wrap the existing admin "Členové" `<Field>` so it is hidden while `onlyMine` is on:

```tsx
{
  isAdmin && !onlyMine ? (
    <Field label="Členové">{/* ...existing MultiSelect name="member"... */}</Field>
  ) : null;
}
```

(Change the existing `{isAdmin ? (` guard around the Členové field to `{isAdmin && !onlyMine ? (`.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS. (Wiring the new props happens in Task 8; until then `page.tsx` may error — if so, proceed to Task 8 and typecheck at its end.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(authenticated)/reports/ReportFiltersForm.tsx"
git commit -m "feat(reports): add group-by control and only-mine toggle" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Reporty page — grouped rendering + PDF buttons

**Files:**

- Create: `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx`
- Modify: `apps/web/src/app/(authenticated)/reports/page.tsx`

- [ ] **Step 1: Create the grouped view component**

Create `apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx` (server component; column headers are the same hardcoded Czech as the original table, relocated — totals/labels come in as props):

```tsx
import type { ReactElement } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  Th,
  Tr,
  Td,
  EmptyState,
} from '@tt/ui';
import type { GroupedReport } from '@/lib/services/reports';
import { fmtDur, ymd } from '@/lib/time-format';
import { ReportsRowActions } from './ReportsRowActions';

interface Props {
  report: GroupedReport;
  autoStackOverlaps: boolean;
  labels: { grandTotal: string; subtotal: string };
}

export function ReportGrouped({ report, autoStackOverlaps, labels }: Props): ReactElement {
  if (report.rowCount === 0) {
    return <EmptyState title="Žádné záznamy odpovídající filtru" />;
  }
  const showUser = report.groupBy !== 'member';
  return (
    <div className="space-y-4">
      {report.groups.map((g) => {
        const heading =
          report.groupBy === 'project' && g.clientName
            ? `${g.clientName} → ${g.label}`
            : report.groupBy === 'day'
              ? ymd(g.rows[0]!.startedAt)
              : g.label;
        return (
          <Card key={g.key}>
            <CardHeader>
              <CardTitle>{heading}</CardTitle>
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                {labels.subtotal}: {fmtDur(g.subtotalMs)}
              </span>
            </CardHeader>
            <CardBody>
              <Table>
                <THead>
                  <tr>
                    <Th>Datum</Th>
                    {showUser ? <Th>Uživatel</Th> : null}
                    {report.groupBy !== 'project' ? <Th>Klient</Th> : null}
                    {report.groupBy !== 'project' ? <Th>Projekt</Th> : null}
                    <Th>Popis</Th>
                    <Th>Štítky</Th>
                    <Th className="text-right">Čas</Th>
                    <Th>Akce</Th>
                  </tr>
                </THead>
                <tbody>
                  {g.rows.map((r) => (
                    <Tr key={r.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">
                        {r.startedAt.toLocaleString('cs-CZ', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </Td>
                      {showUser ? <Td>{r.userName}</Td> : null}
                      {report.groupBy !== 'project' ? (
                        <Td className="text-zinc-700 dark:text-zinc-300">{r.clientName ?? '—'}</Td>
                      ) : null}
                      {report.groupBy !== 'project' ? (
                        <Td className="text-zinc-700 dark:text-zinc-300">{r.projectName ?? '—'}</Td>
                      ) : null}
                      <Td className="max-w-xs truncate" title={r.description}>
                        {r.description}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {r.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:text-zinc-300"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td className="text-right font-mono">{fmtDur(r.durationMs)}</Td>
                      <Td>
                        <ReportsRowActions
                          entryId={r.id}
                          startedAt={r.startedAt.toISOString()}
                          endedAt={r.endedAt ? r.endedAt.toISOString() : null}
                          autoStackOverlaps={autoStackOverlaps}
                        />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        );
      })}
      <div className="flex justify-end gap-2 border-t border-zinc-100 dark:border-zinc-700/60 pt-4">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{labels.grandTotal}:</span>
        <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
          {fmtDur(report.grandTotalMs)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `page.tsx` to group + add PDF buttons**

Edit `apps/web/src/app/(authenticated)/reports/page.tsx`:

(a) Update imports — add `getTranslations`, `buildGroupedReport`/`GroupBy`, `ReportGrouped`; drop the now-unused flat-table imports (`Table, THead, Th, Tr, Td`) and the local `fmtDur`:

```ts
import type { ReactElement } from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@tt/ui';
import { getTranslations } from 'next-intl/server';
import { prisma, requireActiveCompany } from '@/lib/session';
import { PageHeader } from '@/components/PageHeader';
import { buildGroupedReport, runReport, type GroupBy } from '@/lib/services/reports';
import { ReportFiltersForm } from './ReportFiltersForm';
import { ReportGrouped } from './ReportGrouped';
```

(b) Add `groupBy` to the `SP` interface:

```ts
  groupBy?: string;
```

(c) Add a `parseGroupBy` helper next to `asArray`:

```ts
function parseGroupBy(v: string | undefined): GroupBy {
  return v === 'member' || v === 'day' ? v : 'project';
}
```

(d) In the component, compute groupBy, the grouped report, the translations, and pass `meId`/`groupBy` to the form. Replace the body from `const result = await runReport(...)` onward:

```tsx
const groupBy = parseGroupBy(sp.groupBy);
const result = await runReport(prisma(), s.userId, filters);
const report = buildGroupedReport(result.ok ? result.value : [], { groupBy, clampEnd: filters.to });
const t = await getTranslations('reports');

const exportQS = new URLSearchParams();
for (const [k, v] of Object.entries(sp)) {
  if (Array.isArray(v)) v.forEach((x) => exportQS.append(k, x));
  else if (typeof v === 'string') exportQS.append(k, v);
}
if (!exportQS.get('groupBy')) exportQS.set('groupBy', groupBy);

return (
  <div>
    <PageHeader
      title={t('title')}
      description="Seskupený přehled záznamů se součty a exportem."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/reports/export.pdf?preset=lastMonth&groupBy=project"
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            {t('export.lastMonth')}
          </a>
          <a
            href={`/api/reports/export.csv?${exportQS.toString()}`}
            className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            {t('export.csv')}
          </a>
          <a
            href={`/api/reports/export.pdf?${exportQS.toString()}`}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200"
          >
            {t('export.pdf')}
          </a>
        </div>
      }
    />
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('filters')}</CardTitle>
        </CardHeader>
        <CardBody>
          <ReportFiltersForm
            isAdmin={isAdmin}
            meId={s.userId}
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            projects={projects.map((p) => ({ id: p.id, name: `${p.client.name} → ${p.name}` }))}
            members={members.map((m) => ({ id: m.userId, name: m.user.fullName }))}
            tags={tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }))}
            initial={{
              from: sp.from ?? '',
              to: sp.to ?? '',
              clientIds: asArray(sp.client),
              projectIds: asArray(sp.project),
              memberIds: asArray(sp.member),
              tagIds: asArray(sp.tag),
              tagsMode: filters.tagsMode,
              search: sp.search ?? '',
              groupBy,
            }}
          />
        </CardBody>
      </Card>

      <ReportGrouped
        report={report}
        autoStackOverlaps={autoStackUser.autoStackOverlaps}
        labels={{ grandTotal: t('grandTotal'), subtotal: t('subtotal') }}
      />
    </div>
  </div>
);
```

(Delete the old `fmtDur`, the `total` variable, and the entire old "Záznamy" `<Card>`/`<Table>` block that this replaces.)

- [ ] **Step 3: Typecheck + lint**

Run:

```bash
pnpm --filter @tt/web typecheck
pnpm --filter @tt/web lint
```

Expected: both PASS. (Fixes any leftover unused imports from the rewrite.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(authenticated)/reports/page.tsx" "apps/web/src/app/(authenticated)/reports/ReportGrouped.tsx"
git commit -m "feat(reports): grouped report view with subtotals + PDF buttons" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Docs — ADR, user stories, architecture, gotcha, stale comment

**Files:**

- Create: `docs/decisions/0010-pdfmake-for-pdf-export.md`
- Modify: `docs/reference/features.md`, `docs/reference/acceptance.md`
- Modify: `apps/web/src/lib/services/reports.ts` (fix stale comment)
- Modify: `docs/gotchas.md`, `docs/architecture/` (reports doc), and the spec status

- [ ] **Step 1: Write ADR-0010**

Create `docs/decisions/0010-pdfmake-for-pdf-export.md` using `docs/decisions/_template.md`. Decision: **pdfmake (server-side `PdfPrinter`, 0.2 line) for PDF export**, with an embedded DejaVu Sans font and `outputFileTracingIncludes` for standalone builds. Context: US-42 anticipated PDF; the report is tabular with subtotals/totals and Czech text. Rationale: declarative tables, automatic page breaks, footer page numbers, custom-font embedding, no React-19 peer-dependency risk. Alternatives rejected: `@react-pdf/renderer` (React-19 peer friction; manual tables), `pdfkit` (manual table/pagination/subtotal layout), Playwright HTML→PDF (ships Chromium into production — heavy for a self-hosted VPS). Note this supersedes the earlier inline "pdfkit" assumption in `reports.ts`/acceptance.

- [ ] **Step 2: Fix the stale comment in `reports.ts`**

Replace the comment above `rowsToCsv` (`// CSV export (PRD §8.2). XLSX/PDF use the same row shape via dedicated // libraries (xlsx / pdfkit) at the route layer.`) with:

```ts
// CSV export (PRD §8.2). PDF export reuses ReportRow[] via buildGroupedReport +
// buildReportPdf (pdfmake) at the route layer — see ADR-0010. XLSX is not built.
```

- [ ] **Step 3: Add US-77 / US-78 to features.md**

In `docs/reference/features.md`, add:

```markdown
- US-77: Reports group time entries by project / member / day, with per-group subtotals and a grand total.
- US-78: Reports export to PDF (filter-respecting + one-click previous calendar month), Europe/Prague.
```

And tick US-42's PDF leg in the same file's reports section (CSV + PDF done; XLSX still open).

- [ ] **Step 4: Update acceptance.md**

In `docs/reference/acceptance.md`, add evidence rows:

```markdown
- [x] Reports group by project/member/day with subtotals + grand total.
  - apps/web/tests/services/report-grouped.test.ts — US-77.
- [x] Reports export to PDF (incl. last-month preset), cross-company 404.
  - apps/web/tests/services/report-pdf.test.ts, reports-export-pdf-route.test.ts — US-78.
```

Update the existing CSV/XLSX/PDF reports checkbox note: PDF is now built (pdfmake, ADR-0010); XLSX remains the only unbuilt leg of US-42.

- [ ] **Step 5: Architecture + gotcha + spec status**

- In `docs/architecture/` find the reports/dashboard doc and add a short paragraph: Reporty = grouped report + CSV/PDF export (the `runReport → buildGroupedReport → buildReportPdf` flow); contrast with Výkaz (personal week) and Dashboard (fixed company KPIs).
- Append to `docs/gotchas.md`:

```markdown
### 2026-06-01 — PDF shows blank/□ for Czech characters

Standard PDF base-14 fonts (WinAnsi) don't cover Czech diacritics (ř/ě/ů). Fix: embed a Unicode TTF (DejaVu Sans, OFL) and register it with pdfmake. The font lives in `apps/web/src/assets/fonts/` and is read via `fs` at `process.cwd()`; in standalone builds it must be listed in `outputFileTracingIncludes` (next.config.mjs) or it won't ship. If standalone still can't find it, fall back to embedding the TTF as base64 in a `.ts` module.
```

- In `docs/superpowers/specs/2026-06-01-reports-grouped-pdf-export-design.md`, change `Status:` to `Implemented`.

- [ ] **Step 6: Commit**

```bash
git add docs apps/web/src/lib/services/reports.ts
git commit -m "docs(reports): ADR-0010, US-77/78, architecture + gotcha for PDF export" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full quality gates

- [ ] **Step 1: Lint + typecheck + full test suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all green. The new tests (`report-grouped`, `report-pdf`, `reports-export-pdf-route`, the US-77 ids test, the shared `getPreviousMonthRange` test) pass.

- [ ] **Step 2: US coverage tracker**

Run: `pnpm test:trace`
Expected: 100% — US-77 and US-78 are referenced by the new tests. If the tracker reports them missing, confirm the `it('US-77: …')` / `it('US-78: …')` names match the IDs added to `features.md`.

- [ ] **Step 3: Production build + verify the font is traced into standalone**

Run:

```bash
pnpm --filter @tt/web build
find apps/web/.next -path '*reports/export.pdf*' -name '*.ttf' -o -path '*assets/fonts*' -name 'DejaVuSans.ttf' 2>/dev/null | head
```

Expected: build succeeds; the `find` prints at least one `DejaVuSans.ttf` under `.next` (font traced for the route). If the build externalizes pdfmake but errors on `pdfkit`/`fontkit`, add them to `serverExternalPackages` in `next.config.mjs`. If the font is NOT traced, apply the base64 fallback from the gotcha.

- [ ] **Step 4: Commit any gate fixes**

```bash
git add -A
git commit -m "chore(reports): satisfy lint/typecheck/trace/build gates" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Skip if nothing changed.)

---

## Task 11 (optional): E2E smoke for the grouped view + PDF

**Files:**

- Create: `apps/web/tests/e2e/reports-grouped-pdf.spec.ts`

Follow the existing Playwright pattern (`tests/e2e/*.spec.ts`, the admin storage state in `tests/e2e/.auth/admin.json`, and `global-setup.ts`). Assert: (1) `/reports` shows grouped cards with a "Celkem" grand-total row; (2) switching the group-by pill to "Člena" re-groups; (3) clicking "Výkaz za minulý měsíc (PDF)" triggers a download whose filename matches `vykaz-\d{4}-\d{2}\.pdf` (Playwright `page.waitForEvent('download')`). Run: `pnpm --filter @tt/web test:e2e reports-grouped-pdf`. Commit when green.

---

## Self-review checklist (run before handing off)

- [ ] **Spec coverage:** grouped view (T3/T8), subtotals + grand total (T3), PDF general + last-month (T5/T6/T8), previous-month range (T1), Czech font (T0/T5), cross-company 404 (T6), ADR/US/docs (T9), `test:trace` 100% (T10). No spec section unmapped.
- [ ] **Type names consistent:** `GroupBy`, `ReportGroup`, `GroupedReport`, `buildGroupedReport`, `ReportPdfStrings`, `ReportPdfMeta`, `buildReportPdf`, `getPreviousMonthRange` used identically across tasks.
- [ ] **No placeholders:** every code step shows complete code; every run step shows the command + expected result.
