import { describe, it, expect } from 'vitest';
import { fmtTime, dayKey, ymd, fmtDur, weekdayLabel, isWeekend } from './time-format';

describe('time-format (Europe/Prague helpers)', () => {
  it('US-26: fmtTime renders Prague wall-clock for a UTC instant', () => {
    // 2026-05-14 20:22 UTC = 22:22 Prague (CEST = UTC+2 in May)
    expect(fmtTime(new Date('2026-05-14T20:22:00Z'))).toBe('22:22');
  });

  it('US-26: fmtTime renders Prague time when the instant crosses midnight', () => {
    // 2026-05-14 23:10 UTC = 01:10 Prague (the next calendar day)
    expect(fmtTime(new Date('2026-05-14T23:10:00Z'))).toBe('01:10');
  });

  it('US-26: dayKey groups entries by Prague calendar day, not UTC day', () => {
    // 22:22 Prague on May 14 (= 20:22 UTC May 14) belongs to May 14
    expect(dayKey(new Date('2026-05-14T20:22:00Z'))).toBe('2026-05-14');
    // 00:30 Prague on May 15 (= 22:30 UTC May 14) belongs to May 15
    expect(dayKey(new Date('2026-05-14T22:30:00Z'))).toBe('2026-05-15');
  });

  it('US-26: ymd renders the Prague calendar date as dd.MM.yyyy', () => {
    expect(ymd(new Date('2026-05-14T22:30:00Z'))).toBe('15.05.2026');
  });

  it('US-26: fmtDur formats milliseconds as `Xh Ym`', () => {
    expect(fmtDur(0)).toBe('0h 0m');
    expect(fmtDur(60_000)).toBe('0h 1m');
    expect(fmtDur(2 * 3_600_000 + 48 * 60_000)).toBe('2h 48m');
    expect(fmtDur(-100)).toBe('0h 0m');
  });

  it('US-26: weekdayLabel returns the Czech weekday for the Prague day', () => {
    // 2026-05-14 22:30 UTC = 2026-05-15 00:30 Prague → Friday
    expect(weekdayLabel(new Date('2026-05-14T22:30:00Z'))).toBe('pátek');
    // 2026-05-14 12:00 UTC = 2026-05-14 14:00 Prague → Thursday
    expect(weekdayLabel(new Date('2026-05-14T12:00:00Z'))).toBe('čtvrtek');
  });

  it('US-26: isWeekend checks the Prague day, not the UTC day', () => {
    // 2026-05-15 23:00 UTC = 2026-05-16 01:00 Prague (Saturday) → weekend
    expect(isWeekend(new Date('2026-05-15T23:00:00Z'))).toBe(true);
    // 2026-05-14 12:00 UTC = Thursday Prague → not weekend
    expect(isWeekend(new Date('2026-05-14T12:00:00Z'))).toBe(false);
  });
});
