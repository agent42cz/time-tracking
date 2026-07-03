import { describe, expect, it } from 'vitest';
import { preset } from '../../src/app/(authenticated)/reports/date-presets.js';

describe('date presets', () => {
  it('US-89: lastMonth returns the previous full calendar month', () => {
    // Mid-month, local time — no month-boundary ambiguity across time zones.
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('lastMonth', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });

  it('US-89: thisMonth spans the first to the last day of the current month', () => {
    const now = new Date('2026-07-15T10:00:00');
    expect(preset('thisMonth', now)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });
});
