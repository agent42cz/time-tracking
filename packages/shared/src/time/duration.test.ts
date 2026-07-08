import { describe, expect, it } from 'vitest';
import { formatDurationHMS, pad2 } from './duration.js';

describe('pad2', () => {
  it('left-pads single digits to two characters', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(7)).toBe('07');
    expect(pad2(42)).toBe('42');
  });
});

describe('formatDurationHMS', () => {
  it('formats hours, minutes and seconds with zero padding', () => {
    expect(formatDurationHMS(0)).toBe('00:00:00');
    expect(formatDurationHMS(3_661_000)).toBe('01:01:01');
    expect(formatDurationHMS(59_999)).toBe('00:00:59');
  });

  it('clamps negatives to zero', () => {
    expect(formatDurationHMS(-5)).toBe('00:00:00');
  });

  it('does not wrap past 24 hours', () => {
    expect(formatDurationHMS(25 * 3_600_000)).toBe('25:00:00');
  });
});
