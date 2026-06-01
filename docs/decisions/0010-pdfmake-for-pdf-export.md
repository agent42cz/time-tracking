# 0010 — pdfmake for server-side PDF export

- **Status:** Accepted
- **Date:** 2026-06-01
- **Deciders:** [reports task force]
- **Related:** US-78, US-42 (PDF leg), [`tasks/`](../../tasks/), [design spec](../superpowers/specs/2026-06-01-reports-grouped-pdf-export-design.md)

## Context

US-42 anticipated exporting the filtered report to CSV, XLSX, and PDF. CSV was built at v1. XLSX and PDF were deferred. US-78 now adds PDF export: a filter-respecting download plus a one-click "last month" preset.

The report is tabular: a grouped layout (by project / member / day) with per-group subtotals, a grand total, and Czech text throughout (ř/ě/ů/č/š …). The PDF must render legibly and page-break cleanly across long reports. It is generated server-side in a Next.js route handler (`/api/reports/export.pdf`) and served as a download — no browser-side rendering.

An inline comment in `reports.ts` and the v1 `acceptance.md` had assumed `pdfkit` would be used here. This ADR supersedes that assumption.

## Decision

Use **pdfmake 0.2 (`PdfPrinter`, server-side API)** with an embedded **DejaVu Sans** font (OFL-licensed) for all PDF generation.

Key implementation details:

- `PdfPrinter` is instantiated once at module load, reading the `.ttf` files from `apps/web/src/assets/fonts/` via `fs.readFileSync` at `process.cwd()`.
- The `pdfmake` package is added to `serverExternalPackages` in `next.config.mjs` so it is not bundled by webpack.
- The font files are listed in `outputFileTracingIncludes` for the `/api/reports/export.pdf` route so they are copied into the standalone build.
- `buildReportPdf` (in `apps/web/src/lib/services/report-pdf.ts`) is a pure async function: it receives a `GroupedReport` and a `ReportPdfMeta` (including all translated strings via `meta.t`), so it is unit-testable without next-intl or a real HTTP request.

## Alternatives considered

### Alternative A — @react-pdf/renderer

A React-based PDF library that renders JSX to PDF. Attractive for its developer experience, but:

- Had unresolved peer-dependency conflicts with React 19 at the time of this decision.
- Requires manual table-cell layout (no built-in table primitive with automatic column widths or page-break handling).
- The React rendering context is unnecessary overhead for a pure server function.

### Alternative B — pdfkit (direct, low-level)

`pdfkit` is the underlying PDF engine that pdfmake wraps. Using it directly requires manually calculating x/y coordinates, table column widths, subtotal row placement, page overflow, and footer page numbers. The implementation cost for a grouped, paginated table with subtotals is high, and all of that logic is provided for free by pdfmake's declarative table spec. This ADR supersedes the earlier inline assumption that pdfkit would be used.

### Alternative C — Playwright HTML-to-PDF

Playwright can screenshot a page or print it as PDF via `page.pdf()`. While the HTML output would match the UI exactly, running Chromium in production on a self-hosted VPS is prohibitively heavy: the Playwright Chromium binary is ~300 MB, requires shared libraries, and dramatically increases Docker image size and cold-start time. Not viable for a lean self-hosted deployment.

## Consequences

### Positive

- Declarative table definition with automatic column widths, page breaks, header row repetition, and footer page numbers.
- Czech diacritics render correctly via the embedded DejaVu Sans TTF.
- `buildReportPdf` is fully unit-testable (vitest, no HTTP): the test asserts `%PDF-` magic bytes and buffer length.
- No Chromium in production.
- pdfmake 0.2 is a stable, widely-used OSS library with no React peer-dependency risk.

### Negative

- Two TTF font files (~350 KB + ~370 KB) are checked into the repository and must be listed in `outputFileTracingIncludes` for the standalone build. Forgetting this causes a runtime `ENOENT` crash in production (see `docs/gotchas.md`).
- `@types/pdfmake` types the prebuilt browser bundle, not the server `PdfPrinter` default import; a hand-written type shim (`apps/web/src/types/pdfmake.d.ts`) is required.
- XLSX remains unbuilt (out of scope for this ADR).

### Neutral

- pdfmake depends on `pdfkit` internally; both appear in `node_modules` but only `pdfmake` needs to be in `serverExternalPackages`.
- The `GroupedReport` type is already computed for the screen view; `buildReportPdf` consumes it directly, so screen and PDF can never drift on subtotals or grand total.

## Follow-ups

- [ ] Verify the font is present in `.next/standalone` after `pnpm --filter @tt/web build` (Task 10, Step 3).
- [ ] If the standalone build ever omits the font, fall back to embedding the TTF as base64 in a `.ts` module (noted in `docs/gotchas.md`).
- [ ] Consider adding XLSX once there is demand — the same `ReportRow[]` shape from `runReport` / `buildGroupedReport` can feed a `xlsx` writer at the route layer without touching the service.
