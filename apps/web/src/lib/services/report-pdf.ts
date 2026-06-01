/**
 * Server-side PDF rendering for the grouped report (US-78). Pure w.r.t. i18n:
 * all user-facing strings arrive via `meta`, so this is unit-testable without
 * next-intl. Uses pdfmake's PdfPrinter (0.2 API) with an embedded DejaVu Sans
 * font — base-14 PDF fonts can't render Czech diacritics (ř/ě/ů).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pdfmakePkg from 'pdfmake';
import type { TDocumentDefinitions, TableCell, Content } from 'pdfmake/interfaces';
import { toAppZone } from '@tt/shared/time';
import type { GroupedReport, GroupBy } from './reports.js';

// CJS→ESM default-import interop: PdfPrinter may be the module itself or its .default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PdfPrinter = ((pdfmakePkg as any).default ?? pdfmakePkg) as typeof pdfmakePkg;

// process.cwd() is the Next.js app dir (`apps/web`) in dev, `next start`, and
// vitest; the fonts are traced into the standalone build via next.config.mjs.
const FONT_DIR = join(process.cwd(), 'src/assets/fonts');
const dejaVuNormal = readFileSync(join(FONT_DIR, 'DejaVuSans.ttf'));
const dejaVuBold = readFileSync(join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
const printer = new PdfPrinter({
  DejaVu: {
    normal: dejaVuNormal,
    bold: dejaVuBold,
    // pdfmake requires all requested styles to be registered; map italics/bolditalics
    // to the regular/bold faces so `italics: true` in content nodes doesn't throw.
    italics: dejaVuNormal,
    bolditalics: dejaVuBold,
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
