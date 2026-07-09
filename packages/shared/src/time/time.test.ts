import { describe, it, expect, afterEach } from 'vitest';
import {
  setNowProvider,
  now,
  getPeriodRange,
  formatDurationHMS,
  parseAppZoneInput,
  getPreviousMonthRange,
  weekRangeFor,
  isoWorkingDayCountInMonth,
  daysInMonthCount,
} from './index.js';

describe('time helpers', () => {
  afterEach(() => setNowProvider(null));

  it('overrides now via setNowProvider', () => {
    const fixed = new Date('2026-05-03T10:00:00Z');
    setNowProvider(() => fixed);
    expect(now()).toEqual(fixed);
  });

  it('week range starts on Monday in Europe/Prague', () => {
    // 2026-05-03 is a Sunday. Monday should be 2026-04-27.
    const ref = new Date('2026-05-03T10:00:00Z');
    const range = getPeriodRange('week', ref);
    expect(range.start.toISOString()).toBe('2026-04-26T22:00:00.000Z');
  });

  it('formats durations as HH:MM:SS', () => {
    expect(formatDurationHMS(0)).toBe('00:00:00');
    expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
    expect(formatDurationHMS(-5)).toBe('00:00:00');
  });

  it('US-23: parses manual-entry form input as Europe/Prague wall-clock time', () => {
    // 15:00 in Prague (CEST = UTC+2 on 2026-05-08) is 13:00 UTC.
    expect(parseAppZoneInput('2026-05-08', '15:00').toISOString()).toBe('2026-05-08T13:00:00.000Z');
    // Winter date (CET = UTC+1).
    expect(parseAppZoneInput('2026-01-15', '09:30').toISOString()).toBe('2026-01-15T08:30:00.000Z');
  });

  it('getPreviousMonthRange returns the previous full calendar month as a half-open Prague range', () => {
    setNowProvider(() => new Date('2026-06-01T10:00:00Z'));
    const r = getPreviousMonthRange();
    // 1 May 2026 00:00 Prague (CEST = UTC+2) === 2026-04-30T22:00:00Z
    expect(r.start.toISOString()).toBe('2026-04-30T22:00:00.000Z');
    // exclusive end = 1 Jun 2026 00:00 Prague === 2026-05-31T22:00:00Z
    expect(r.end.toISOString()).toBe('2026-05-31T22:00:00.000Z');
    setNowProvider(null);
  });

  it('US-90: week starting Wednesday contains the reference and spans 7 days', () => {
    // 2026-05-08 is a Friday (ISO 5). Week starts Wed 2026-05-06.
    const ref = new Date('2026-05-08T12:00:00Z');
    const r = weekRangeFor(3, ref);
    // start = 2026-05-06 00:00 Prague == 2026-05-05T22:00:00Z (CEST, +02:00)
    expect(r.start.toISOString()).toBe('2026-05-05T22:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-05-12T22:00:00.000Z');
    expect(ref >= r.start && ref < r.end).toBe(true);
  });

  it('US-90: when reference weekday == weekStartsOn, window starts that same day', () => {
    // 2026-05-06 is a Wednesday (ISO 3).
    const ref = new Date('2026-05-06T09:00:00Z');
    const r = weekRangeFor(3, ref);
    expect(r.start.toISOString()).toBe('2026-05-05T22:00:00.000Z');
  });

  it('US-90: counts working-day occurrences in a month', () => {
    // May 2026: Wednesdays = 6,13,20,27 (4); Thursdays 7,14,21,28 (4); Fridays 1,8,15,22,29 (5) => 13
    const ref = new Date('2026-05-15T12:00:00Z');
    expect(isoWorkingDayCountInMonth([3, 4, 5], ref)).toBe(13);
    // Mondays 4,11,18,25 (4) + Tuesdays 5,12,19,26 (4) = 8
    expect(isoWorkingDayCountInMonth([1, 2], ref)).toBe(8);
    expect(daysInMonthCount(ref)).toBe(31);
  });
});
