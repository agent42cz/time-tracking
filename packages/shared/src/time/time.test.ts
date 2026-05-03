import { describe, it, expect, afterEach } from 'vitest';
import { setNowProvider, now, getPeriodRange, formatDurationHMS } from './index.js';

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
});
