import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { preset } from '../../src/app/(authenticated)/reports/date-presets.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

describe('date presets', () => {
  it('US-41: today preset is a single inclusive calendar day (from === to)', () => {
    const now = new Date('2026-08-24T15:00:00');
    expect(preset('today', now)).toEqual({ from: '2026-08-24', to: '2026-08-24' });
  });

  it('US-89: lastMonth returns the previous full calendar month', () => {
    // Mid-month, local time — no month-boundary ambiguity across time zones.
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('lastMonth', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('US-89: thisMonth spans the first to the last day of the current month', () => {
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('thisMonth', now)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('US-41: report and audit date query params go through parseInclusiveAppZoneRange', () => {
    const files = [
      'app/(authenticated)/reports/page.tsx',
      'app/api/reports/export.csv/route.ts',
      'app/api/reports/export.pdf/route.ts',
      'app/(authenticated)/audit/page.tsx',
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(srcRoot, rel), 'utf8');
      expect(src, rel).toContain('parseInclusiveAppZoneRange');
      expect(src, rel).not.toMatch(/new Date\(\s*sp\.(from|to)/);
      expect(src, rel).not.toMatch(/new Date\(\s*sp\.get\('(from|to)'\)/);
    }
  });
});
