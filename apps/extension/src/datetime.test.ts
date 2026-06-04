import { describe, expect, it } from 'vitest';
import {
  combineToIso,
  fromLocalInput,
  resolveWindow,
  toDateInput,
  toLocalInput,
  toTimeInput,
} from './datetime.js';

describe('datetime input helpers', () => {
  it('toLocalInput produces a YYYY-MM-DDTHH:MM string', () => {
    expect(toLocalInput('2026-06-04T08:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('round-trips an ISO timestamp to minute precision', () => {
    const iso = '2026-06-04T08:30:00.000Z';
    const back = fromLocalInput(toLocalInput(iso));
    expect(Math.abs(new Date(back).getTime() - new Date(iso).getTime())).toBeLessThan(60_000);
  });

  it('toDateInput produces a YYYY-MM-DD string', () => {
    expect(toDateInput('2026-06-04T08:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('toTimeInput produces an HH:MM string', () => {
    expect(toTimeInput('2026-06-04T08:30:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('toDateInput/toTimeInput round-trip via combineToIso to minute precision', () => {
    const iso = '2026-06-04T08:30:00.000Z';
    const back = combineToIso(toDateInput(iso), toTimeInput(iso));
    expect(Math.abs(new Date(back).getTime() - new Date(iso).getTime())).toBeLessThan(60_000);
  });

  it('resolveWindow: same-day window stays on the same day with the right duration', () => {
    const { startIso, endIso, nextDay } = resolveWindow('2026-06-04', '09:00', '17:00');
    expect(nextDay).toBe(false);
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(8 * 3600 * 1000);
  });

  it('resolveWindow: end before start rolls to the next day (crosses midnight)', () => {
    const { startIso, endIso, nextDay } = resolveWindow('2026-06-04', '23:00', '01:00');
    expect(nextDay).toBe(true);
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(2 * 3600 * 1000);
  });

  it('resolveWindow: equal times roll a full day forward', () => {
    const { startIso, endIso, nextDay } = resolveWindow('2026-06-04', '10:00', '10:00');
    expect(nextDay).toBe(true);
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(24 * 3600 * 1000);
  });
});
