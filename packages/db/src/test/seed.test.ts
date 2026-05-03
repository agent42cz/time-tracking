/**
 * Seed verification — runs `seed()` against an empty container DB
 * (NOT inside a withTx, so it actually persists for the assertions),
 * then resets at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, resetDb, stopTestPrisma } from './index.js';
import { SEED_IDS, seed } from '../seed.js';

beforeAll(async () => {
  const prisma = await getTestPrisma();
  await resetDb(prisma);
  await seed(prisma);
}, 180_000);

afterAll(async () => {
  const prisma = await getTestPrisma();
  await resetDb(prisma);
  await stopTestPrisma();
}, 30_000);

describe('seed (PRD §14.4)', () => {
  it('creates 2 companies', async () => {
    const prisma = await getTestPrisma();
    const count = await prisma.company.count();
    expect(count).toBe(2);
  });

  it('cross user is admin in A and user in B', async () => {
    const prisma = await getTestPrisma();
    const memberships = await prisma.membership.findMany({
      where: { userId: SEED_IDS.userCross },
      orderBy: { companyId: 'asc' },
    });
    expect(memberships).toHaveLength(2);
    const a = memberships.find((m) => m.companyId === SEED_IDS.companyA);
    const b = memberships.find((m) => m.companyId === SEED_IDS.companyB);
    expect(a?.role).toBe('admin');
    expect(b?.role).toBe('user');
  });

  it('creates clients/projects/tags scoped to companies', async () => {
    const prisma = await getTestPrisma();
    const clientsA = await prisma.client.findMany({ where: { companyId: SEED_IDS.companyA } });
    expect(clientsA.map((c) => c.id).sort()).toEqual([SEED_IDS.clientA1, SEED_IDS.clientA2].sort());
    const tagsB = await prisma.tag.findMany({ where: { companyId: SEED_IDS.companyB } });
    expect(tagsB.map((t) => t.id)).toEqual([SEED_IDS.tagB1]);
  });

  it('creates known-date time entries', async () => {
    const prisma = await getTestPrisma();
    const entries = await prisma.timeEntry.findMany({ orderBy: { id: 'asc' } });
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.startedAt instanceof Date && e.endedAt instanceof Date)).toBe(
      true,
    );
  });
});
