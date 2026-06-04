import { describe, expect, it } from 'vitest';
import { fromLocalInput, toLocalInput } from './datetime.js';

describe('datetime input helpers', () => {
  it('toLocalInput produces a YYYY-MM-DDTHH:MM string', () => {
    expect(toLocalInput('2026-06-04T08:30:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('round-trips an ISO timestamp to minute precision', () => {
    const iso = '2026-06-04T08:30:00.000Z';
    const back = fromLocalInput(toLocalInput(iso));
    expect(Math.abs(new Date(back).getTime() - new Date(iso).getTime())).toBeLessThan(60_000);
  });
});
