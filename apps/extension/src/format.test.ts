import { describe, expect, it } from 'vitest';
import { fmtDurationHM } from './format.js';

describe('fmtDurationHM', () => {
  it('formats hours and minutes with zero padding, no seconds', () => {
    expect(fmtDurationHM(0)).toBe('00:00');
    expect(fmtDurationHM(90 * 60_000)).toBe('01:30');
    expect(fmtDurationHM(5 * 3_600_000 + 7 * 60_000)).toBe('05:07');
  });

  it('floors sub-minute remainders and clamps negatives', () => {
    expect(fmtDurationHM(59_000)).toBe('00:00');
    expect(fmtDurationHM(61_000)).toBe('00:01');
    expect(fmtDurationHM(-5_000)).toBe('00:00');
  });
});
