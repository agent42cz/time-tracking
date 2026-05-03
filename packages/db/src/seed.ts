/**
 * Deterministic seed per PRD §14.4:
 *   2 companies, 1 cross-company user (Admin in A, User in B),
 *   2 single-company users, clients/projects/tags/entries on known dates.
 *
 * Stable string IDs (`seed-*`) so tests can target them without lookups.
 * Fixed dates anchored to 2026-05-01 (Friday) to keep period-boundary
 * tests reproducible across DST.
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const SEED_PASSWORD = 'CorrectHorseBatteryStaple1!';

export const SEED_IDS = {
  companyA: 'seed-co-a',
  companyB: 'seed-co-b',
  userCross: 'seed-user-cross',
  userA: 'seed-user-a',
  userB: 'seed-user-b',
  clientA1: 'seed-client-a1',
  clientA2: 'seed-client-a2',
  clientB1: 'seed-client-b1',
  projectA1: 'seed-project-a1',
  projectA2: 'seed-project-a2',
  projectB1: 'seed-project-b1',
  tagA1: 'seed-tag-a1',
  tagA2: 'seed-tag-a2',
  tagB1: 'seed-tag-b1',
} as const;

export const SEED_ANCHOR = new Date('2026-05-01T08:00:00.000Z'); // Friday morning UTC.

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

export async function seed(prisma: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

  await prisma.$transaction(async (tx) => {
    // --- Users
    await tx.user.createMany({
      data: [
        {
          id: SEED_IDS.userCross,
          email: 'cross@example.test',
          passwordHash,
          fullName: 'Cross Company',
        },
        { id: SEED_IDS.userA, email: 'usera@example.test', passwordHash, fullName: 'User A' },
        { id: SEED_IDS.userB, email: 'userb@example.test', passwordHash, fullName: 'User B' },
      ],
    });

    // --- Companies
    await tx.company.createMany({
      data: [
        {
          id: SEED_IDS.companyA,
          name: 'Company A',
          slug: 'company-a',
          createdById: SEED_IDS.userCross,
        },
        {
          id: SEED_IDS.companyB,
          name: 'Company B',
          slug: 'company-b',
          createdById: SEED_IDS.userCross,
        },
      ],
    });

    // --- Memberships (cross is Admin in A, User in B)
    await tx.membership.createMany({
      data: [
        { userId: SEED_IDS.userCross, companyId: SEED_IDS.companyA, role: 'admin' },
        { userId: SEED_IDS.userCross, companyId: SEED_IDS.companyB, role: 'user' },
        { userId: SEED_IDS.userA, companyId: SEED_IDS.companyA, role: 'user' },
        { userId: SEED_IDS.userB, companyId: SEED_IDS.companyB, role: 'admin' },
      ],
    });

    // --- Clients & Projects
    await tx.client.createMany({
      data: [
        { id: SEED_IDS.clientA1, companyId: SEED_IDS.companyA, name: 'Acme A1' },
        { id: SEED_IDS.clientA2, companyId: SEED_IDS.companyA, name: 'Acme A2' },
        { id: SEED_IDS.clientB1, companyId: SEED_IDS.companyB, name: 'Beta B1' },
      ],
    });
    await tx.project.createMany({
      data: [
        { id: SEED_IDS.projectA1, clientId: SEED_IDS.clientA1, name: 'Website' },
        { id: SEED_IDS.projectA2, clientId: SEED_IDS.clientA2, name: 'Mobile' },
        { id: SEED_IDS.projectB1, clientId: SEED_IDS.clientB1, name: 'Backend' },
      ],
    });

    // --- Tags
    await tx.tag.createMany({
      data: [
        { id: SEED_IDS.tagA1, companyId: SEED_IDS.companyA, name: 'meeting', color: '#3b82f6' },
        { id: SEED_IDS.tagA2, companyId: SEED_IDS.companyA, name: 'deep-work', color: '#10b981' },
        { id: SEED_IDS.tagB1, companyId: SEED_IDS.companyB, name: 'support', color: '#f59e0b' },
      ],
    });

    // --- Time entries on known dates anchored to SEED_ANCHOR.
    // Cross/admin in A logs 2h Friday morning, User A logs 1.5h Friday afternoon.
    await tx.timeEntry.create({
      data: {
        id: 'seed-entry-a-1',
        userId: SEED_IDS.userCross,
        companyId: SEED_IDS.companyA,
        clientId: SEED_IDS.clientA1,
        projectId: SEED_IDS.projectA1,
        description: 'Kick-off meeting',
        startedAt: SEED_ANCHOR,
        endedAt: new Date(SEED_ANCHOR.getTime() + hours(2)),
        tags: { create: [{ tagId: SEED_IDS.tagA1 }] },
      },
    });
    await tx.timeEntry.create({
      data: {
        id: 'seed-entry-a-2',
        userId: SEED_IDS.userA,
        companyId: SEED_IDS.companyA,
        clientId: SEED_IDS.clientA2,
        projectId: SEED_IDS.projectA2,
        description: 'Implement login',
        startedAt: new Date(SEED_ANCHOR.getTime() + hours(5)),
        endedAt: new Date(SEED_ANCHOR.getTime() + hours(6) + hours(0.5)),
        tags: { create: [{ tagId: SEED_IDS.tagA2 }] },
      },
    });
    // User B in company B
    await tx.timeEntry.create({
      data: {
        id: 'seed-entry-b-1',
        userId: SEED_IDS.userB,
        companyId: SEED_IDS.companyB,
        clientId: SEED_IDS.clientB1,
        projectId: SEED_IDS.projectB1,
        description: 'Customer call',
        startedAt: new Date(SEED_ANCHOR.getTime() + hours(1)),
        endedAt: new Date(SEED_ANCHOR.getTime() + hours(2)),
        tags: { create: [{ tagId: SEED_IDS.tagB1 }] },
      },
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => prisma.$disconnect())
    .then(() => {
      process.stdout.write('Seed complete.\n');
    })
    .catch((err: unknown) => {
      process.stderr.write(`Seed failed: ${String(err)}\n`);
      process.exit(1);
    });
}
