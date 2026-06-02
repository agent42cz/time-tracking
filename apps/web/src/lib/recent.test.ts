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

  it('US-26: clamps a still-running entry to `now` for the per-day total', () => {
    const now = new Date('2026-06-02T11:00:00Z'); // Prague 13:00
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-06-02T08:00:00Z', endedAt: null })],
      now,
    );
    expect(groups[0]!.total).toBe(3 * H); // 10:00 -> 13:00 Prague = 3h
  });

  it('US-26: keeps non-contiguous same-day entries as separate groups (server order preserved)', () => {
    const NOW = new Date('2026-06-02T09:00:00Z');
    const groups = groupRecentByDay(
      [
        entry({ startedAt: '2026-06-02T08:00:00Z', endedAt: '2026-06-02T09:00:00Z' }),
        entry({ startedAt: '2026-06-01T08:00:00Z', endedAt: '2026-06-01T09:00:00Z' }),
        entry({ startedAt: '2026-06-02T06:00:00Z', endedAt: '2026-06-02T07:00:00Z' }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual(['2026-06-02', '2026-06-01', '2026-06-02']);
  });

  it('US-26: labels older days with the Czech weekday + date', () => {
    const NOW = new Date('2026-06-02T09:00:00Z');
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-05-28T08:00:00Z', endedAt: '2026-05-28T09:00:00Z' })],
      NOW,
    );
    expect(groups[0]!.label).toBe('Čt 28.05.'); // Thu 28 May 2026
  });

  it('US-26: "Včera" is correct across the spring-forward DST boundary', () => {
    // 2026 CET→CEST is 2026-03-29 (23h day). now = 2026-03-30 00:30 Prague (= 2026-03-29T22:30Z).
    const now = new Date('2026-03-29T22:30:00Z');
    const groups = groupRecentByDay(
      [entry({ startedAt: '2026-03-29T10:00:00Z', endedAt: '2026-03-29T11:00:00Z' })],
      now,
    );
    expect(groups[0]!.label).toBe('Včera'); // would FAIL with the old -24h logic (would label 'Ne 29.03.')
  });
});
