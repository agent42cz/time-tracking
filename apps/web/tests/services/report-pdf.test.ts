/** Phase 12 — PDF builder. Covers US-78. */
import { describe, expect, it, vi } from 'vitest';
import pdfmakePkg from 'pdfmake';
import { buildReportPdf, type ReportPdfStrings } from '../../src/lib/services/report-pdf.js';
import {
  buildGroupedReport,
  type GroupBy,
  type ReportRow,
} from '../../src/lib/services/reports.js';

// Same CJS→ESM interop as report-pdf.ts: the module resolves to the same class
// instance, so spying on its prototype here intercepts calls made inside the
// service under test too — that's what lets us inspect the docDefinition it builds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PdfPrinter = ((pdfmakePkg as any).default ?? pdfmakePkg) as typeof pdfmakePkg;

const H = 60 * 60 * 1000;
const STR: ReportPdfStrings = {
  date: 'Datum',
  user: 'Uživatel',
  description: 'Popis',
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
    clientColor: '#b91c1c',
    projectId: 'p1',
    projectName: 'Příliš žluťoučký projekt',
    description: 'Ladění úložiště',
    startedAt: new Date('2026-05-04T08:00:00Z'),
    endedAt: new Date('2026-05-04T10:00:00Z'),
    durationMs: 2 * H,
  };
}

function meta(groupBy: GroupBy = 'project') {
  return {
    companyName: 'Agentura 42',
    title: 'Výkaz práce',
    periodLabel: '1. 5. 2026 – 31. 5. 2026',
    generatedAt: new Date('2026-06-01T09:00:00Z'),
    groupBy,
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

  it('US-41: member-grouped export (showUser=false) keeps span, widths and header cell count in lockstep', async () => {
    const report = buildGroupedReport([sampleRow()], { groupBy: 'member' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let captured: any;
    const original = PdfPrinter.prototype.createPdfKitDocument;
    const spy = vi
      .spyOn(PdfPrinter.prototype, 'createPdfKitDocument')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementationOnce(function (this: unknown, docDefinition: any, options?: any) {
        captured = docDefinition;
        return original.call(this, docDefinition, options);
      });

    try {
      const buf = await buildReportPdf(report, meta('member'));
      expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    } finally {
      spy.mockRestore();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableItem = captured.content.find((c: any) => c && typeof c === 'object' && 'table' in c);
    expect(tableItem).toBeDefined();

    const { body, widths } = tableItem.table;
    const header = body[0];
    const subtotalRow = body[body.length - 1];
    const span: number = subtotalRow[0].colSpan;

    // The live invariant: pdfmake requires a row's cell count to equal span + 1.
    // For groupBy: 'member' (showUser === false) this must be 3 (date/description/duration),
    // not the 4-column shape used for showUser === true.
    expect(span).toBe(2);
    expect(header.length).toBe(span + 1);
    expect(widths.length).toBe(span + 1);
  });
});
