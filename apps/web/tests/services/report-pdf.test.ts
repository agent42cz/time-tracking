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
