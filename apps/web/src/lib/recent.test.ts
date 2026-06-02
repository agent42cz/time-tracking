import { describe, expect, it } from 'vitest';
import { groupRecentByDay, type RecentEntryInput } from './recent.js';

const H = 60 * 60 * 1000;

function entry(over: Partial<RecentEntryInput>): RecentEntryInput {
  return {
    id: Math.random().toString(36).slice(2),
    description: 'work',
    startedAt: '2026-06-02T08:00:00Z',
    endedAt: '2026-06-02T10:00:00Z',
    clientName: 'Acme',
    projectName: 'Web',
    tags: [],
    ...over,
  };
}

describe('groupRecentByDay', () => {
  const NOW = new Date('2026-06-02T09:00:00Z'); // Prague: 2 Jun 2026, 11:00 (CEST)

  it('US-26: groups consecutive same-day entries with a per-day total', () => {
    const groups = groupRecentByDay(
      [
        entry({ startedAt: '2026-06-02T08:00:00Z', endedAt: '2026-06-02T10:00:00Z' }), // 2h
        entry({ startedAt: '2026-06-02T06:00:00Z', endedAt: '2026-06-02T07:00:00Z' }), // 1h, same Prague day
        entry({ startedAt: '2026-06-01T06:00:00Z', endedAt: '2026-06-01T07:30:00Z' }), // prev day
      ],
      NOW,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.key).toBe('2026-06-02');
    expect(groups[0]!.total).toBe(3 * H);
    expect(groups[0]!.label).toBe('Dnes');
    expect(groups[1]!.label).toBe('Včera');
  });

  it('US-26: labels months for dividers and buckets a cross-midnight entry by its Prague day', () => {
    // 2026-05-31 22:30 UTC = 2026-06-01 00:30 Prague (CEST) → belongs to June 1.
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-05-31T22:30:00Z', endedAt: '2026-05-31T23:00:00Z' })],
      NOW,
    );
    expect(groups[0]!.key).toBe('2026-06-01');
    expect(groups[0]!.monthKey).toBe('2026-06');
    expect(groups[0]!.monthLabel).toBe('Červen 2026');
  });

  it('US-26: tolerates empty / null input', () => {
    expect(groupRecentByDay([], NOW)).toEqual([]);
    expect(groupRecentByDay(null, NOW)).toEqual([]);
  });
});
