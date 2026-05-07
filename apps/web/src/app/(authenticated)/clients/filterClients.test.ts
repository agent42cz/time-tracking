import { describe, expect, it } from 'vitest';
import { filterClients, type FilterClient } from './filterClients.js';

const seed: FilterClient[] = [
  {
    id: 'c1',
    name: 'Agent 42',
    archived: false,
    projects: [
      { id: 'p1', name: 'Google Work Space', archived: false },
      { id: 'p2', name: 'Instalace agenta', archived: false },
    ],
  },
  {
    id: 'c2',
    name: 'Agént Diakritika',
    archived: false,
    projects: [{ id: 'p3', name: 'Web', archived: false }],
  },
  {
    id: 'c3',
    name: 'Old Co',
    archived: true,
    projects: [{ id: 'p4', name: 'Sunset', archived: true }],
  },
];

describe('filterClients', () => {
  it('US-51: empty query returns all clients visible, none auto-expanded', () => {
    const r = filterClients(seed, '');
    expect(r.visible.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(r.autoExpanded.size).toBe(0);
  });

  it('US-51: matching a client name keeps the client and all its projects visible', () => {
    const r = filterClients(seed, 'agent 42');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
    expect(r.visible[0]!.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(r.autoExpanded.has('c1')).toBe(false);
  });

  it('US-51: matching a project name auto-expands the parent and includes only matching projects', () => {
    const r = filterClients(seed, 'instalace');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
    expect(r.visible[0]!.projects.map((p) => p.id)).toEqual(['p2']);
    expect(r.autoExpanded.has('c1')).toBe(true);
  });

  it('US-51: search is diacritic-insensitive ("agent" matches "Agént")', () => {
    const r = filterClients(seed, 'agent');
    expect(r.visible.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('US-51: search is case-insensitive', () => {
    const r = filterClients(seed, 'AGENT 42');
    expect(r.visible.map((c) => c.id)).toEqual(['c1']);
  });

  it('US-51: archived clients participate in search results', () => {
    const r = filterClients(seed, 'sunset');
    expect(r.visible.map((c) => c.id)).toEqual(['c3']);
    expect(r.autoExpanded.has('c3')).toBe(true);
  });

  it('US-51: filter does not mutate input', () => {
    const before = JSON.stringify(seed);
    filterClients(seed, 'agent');
    expect(JSON.stringify(seed)).toBe(before);
  });
});
