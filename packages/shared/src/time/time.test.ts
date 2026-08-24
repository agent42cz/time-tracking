import { describe, it, expect, afterEach } from 'vitest';
import {
  setNowProvider,
  now,
  getPeriodRange,
  formatDurationHMS,
  parseAppZoneInput,
  parseInclusiveAppZoneRange,
  getPreviousMonthRange,
  weekRangeFor,
  isoWorkingDayCountInMonth,
  isoWorkingDaysToDateInMonth,
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

  it('re-exports the pure duration formatters from the barrel', () => {
    expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
  });

  it('US-23: parses manual-entry form input as Europe/Prague wall-clock time', () => {
    // 15:00 in Prague (CEST = UTC+2 on 2026-05-08) is 13:00 UTC.
    expect(parseAppZoneInput('2026-05-08', '15:00').toISOString()).toBe('2026-05-08T13:00:00.000Z');
    // Winter date (CET = UTC+1).
    expect(parseAppZoneInput('2026-01-15', '09:30').toISOString()).toBe('2026-01-15T08:30:00.000Z');
  });

  it('US-41: inclusive same-day YYYY-MM-DD range covers the whole Prague day', () => {
    // Reports form "Dnes" sends from=to=that calendar day. The service filter is
    // half-open [from, to), so `to` must be midnight of the *next* Prague day.
    const r = parseInclusiveAppZoneRange('2026-08-24', '2026-08-24');
    // 24 Aug 2026 00:00 CEST (UTC+2)
    expect(r.from?.toISOString()).toBe('2026-08-23T22:00:00.000Z');
    expect(r.to?.toISOString()).toBe('2026-08-24T22:00:00.000Z');
  });

  it('US-41: inclusive last-day-of-month is not dropped from the half-open range', () => {
    const r = parseInclusiveAppZoneRange('2026-06-01', '2026-06-30');
    // 1 Jun 2026 00:00 CEST
    expect(r.from?.toISOString()).toBe('2026-05-31T22:00:00.000Z');
    // exclusive end = 1 Jul 2026 00:00 CEST
    expect(r.to?.toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });

  it('US-41: inclusive range uses CET in winter', () => {
    const r = parseInclusiveAppZoneRange('2026-01-15', '2026-01-15');
    // 15 Jan 2026 00:00 CET (UTC+1)
    expect(r.from?.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(r.to?.toISOString()).toBe('2026-01-15T23:00:00.000Z');
  });

  it('US-41: empty date strings are omitted so an unfiltered report stays unfiltered', () => {
    expect(parseInclusiveAppZoneRange('', '')).toEqual({});
    expect(parseInclusiveAppZoneRange(undefined, undefined)).toEqual({});
    expect(parseInclusiveAppZoneRange(null, '2026-08-24').from).toBeUndefined();
    expect(parseInclusiveAppZoneRange('2026-08-24', null).to).toBeUndefined();
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

  it('US-90: monthly working-day count changes per calendar month (Mon+Tue fund)', () => {
    // SVĚT PLODŮ works Mon+Tue. The monthly fund is #(Mon+Tue) × daily target,
    // and that count is different every month.
    // June 2026 (June 1 = Monday): Mondays 1,8,15,22,29 (5) + Tuesdays 2,9,16,23,30 (5) = 10 → 80 h.
    expect(isoWorkingDayCountInMonth([1, 2], new Date('2026-06-15T12:00:00Z'))).toBe(10);
    // July 2026 (July 1 = Wednesday): Mondays 6,13,20,27 (4) + Tuesdays 7,14,21,28 (4) = 8 → 64 h.
    expect(isoWorkingDayCountInMonth([1, 2], new Date('2026-07-15T12:00:00Z'))).toBe(8);
    // August 2026 (Aug 1 = Saturday): Mondays 3,10,17,24,31 (5) + Tuesdays 4,11,18,25 (4) = 9 → 72 h.
    expect(isoWorkingDayCountInMonth([1, 2], new Date('2026-08-15T12:00:00Z'))).toBe(9);
  });

  it('US-90: counts working days elapsed so far this month (to date)', () => {
    // July 2026, on Thu July 9: Mon/Tue already passed = Mon 6 + Tue 7 = 2.
    expect(isoWorkingDaysToDateInMonth([1, 2], new Date('2026-07-09T12:00:00Z'))).toBe(2);
    // Same month at end (July 31): all 8 have arrived.
    expect(isoWorkingDaysToDateInMonth([1, 2], new Date('2026-07-31T12:00:00Z'))).toBe(8);
    // On the 1st working day itself (Mon July 6) it counts that day.
    expect(isoWorkingDaysToDateInMonth([1, 2], new Date('2026-07-06T12:00:00Z'))).toBe(1);
    // Hours-only clients (no working days) → 0.
    expect(isoWorkingDaysToDateInMonth([], new Date('2026-07-09T12:00:00Z'))).toBe(0);
  });
});
