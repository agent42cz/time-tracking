import { describe, it, expect, afterEach } from 'vitest';
import {
  setNowProvider,
  now,
  getPeriodRange,
  formatDurationHMS,
  parseAppZoneInput,
  getPreviousMonthRange,
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
});
