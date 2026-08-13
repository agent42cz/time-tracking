import { describe, expect, it } from 'vitest';
import {
  absenceLengthDays,
  addDaysToDay,
  isDayString,
  leadDays,
  validateAbsenceDates,
} from './index.js';

describe('absence date rules', () => {
  it('US-106: rejects a notice filed for today or the past, accepts tomorrow', () => {
    expect(validateAbsenceDates('2026-08-13', '2026-08-13', '2026-08-13').error).toBe('too_late');
    expect(validateAbsenceDates('2026-08-13', '2026-08-12', '2026-08-12').error).toBe('too_late');
    expect(validateAbsenceDates('2026-08-13', '2026-08-14', '2026-08-14').ok).toBe(true);
  });

  it('US-105: a long absence is accepted on its lead time alone, whenever it is filed', () => {
    // Length no longer changes the verdict — the month-ahead rule was dropped
    // (US-107, retired), so only the one-day lead time can reject anything.
    expect(absenceLengthDays('2026-08-20', '2026-08-24')).toBe(5);
    expect(validateAbsenceDates('2026-08-13', '2026-08-20', '2026-08-24').ok).toBe(true);
    expect(validateAbsenceDates('2026-08-13', '2026-09-13', '2026-09-17').ok).toBe(true);
  });

  it('US-105: parses and measures day ranges without timezone drift', () => {
    expect(isDayString('2026-08-13')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('13.08.2026')).toBe(false);
    expect(absenceLengthDays('2026-08-13', '2026-08-13')).toBe(1);
    // Across the Prague DST change (2026-10-25) the day count must stay exact.
    expect(absenceLengthDays('2026-10-24', '2026-10-26')).toBe(3);
    expect(leadDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDaysToDay('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDaysToDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(validateAbsenceDates('2026-08-13', '2026-08-20', '2026-08-19').error).toBe(
      'end_before_start',
    );
  });
});
