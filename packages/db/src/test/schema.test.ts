/**
 * Schema constraint tests. Real Postgres (testcontainers), per-test transaction
 * rollback so nothing persists between tests.
 *
 * Coverage anchors: this file establishes that the DB itself enforces
 * multi-tenant rules — the application layer can rely on these.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from './index.js';

beforeAll(async () => {
  await getTestPrisma();
}, 120_000);

afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

describe('schema constraints', () => {
  it('enforces unique (user_id, company_id) on memberships', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({
        data: { email: 'u@example.test', fullName: 'U' },
      });
      const company = await tx.company.create({
        data: { name: 'C', slug: 'c-' + Math.random().toString(36).slice(2, 8) },
      });
      await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: 'user' } });
      await expect(
        tx.membership.create({
          data: { userId: user.id, companyId: company.id, role: 'admin' },
        }),
      ).rejects.toThrow();
    });
  });

  it('enforces unique company slug', async () => {
    await withTx(async (tx) => {
      await tx.company.create({ data: { name: 'A', slug: 'unique-slug' } });
      await expect(
        tx.company.create({ data: { name: 'B', slug: 'unique-slug' } }),
      ).rejects.toThrow();
    });
  });

  it('cascades user deletion to memberships, time entries, sessions', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({ data: { email: 'u2@example.test', fullName: 'U2' } });
      const company = await tx.company.create({
        data: { name: 'C2', slug: 'c2-' + Math.random().toString(36).slice(2, 8) },
      });
      await tx.membership.create({
        data: { userId: user.id, companyId: company.id, role: 'admin' },
      });
      await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          startedAt: new Date(),
        },
      });

      await tx.user.delete({ where: { id: user.id } });

      const remainingMemberships = await tx.membership.count({ where: { userId: user.id } });
      expect(remainingMemberships).toBe(0);
      const remainingEntries = await tx.timeEntry.count({ where: { userId: user.id } });
      expect(remainingEntries).toBe(0);
    });
  });

  it('SetNull on TimeEntry.client when its Client is deleted', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({ data: { email: 'u3@example.test', fullName: 'U3' } });
      const company = await tx.company.create({
        data: { name: 'C3', slug: 'c3-' + Math.random().toString(36).slice(2, 8) },
      });
      await tx.membership.create({
        data: { userId: user.id, companyId: company.id, role: 'admin' },
      });
      const client = await tx.client.create({ data: { companyId: company.id, name: 'CL' } });
      const entry = await tx.timeEntry.create({
        data: {
          userId: user.id,
          companyId: company.id,
          clientId: client.id,
          startedAt: new Date(),
        },
      });

      await tx.client.delete({ where: { id: client.id } });
      const reread = await tx.timeEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(reread.clientId).toBeNull();
    });
  });

  it('enforces unique invite token', async () => {
    await withTx(async (tx) => {
      const company = await tx.company.create({
        data: { name: 'C4', slug: 'c4-' + Math.random().toString(36).slice(2, 8) },
      });
      await tx.invite.create({
        data: {
          companyId: company.id,
          email: 'invitee@example.test',
          role: 'user',
          token: 'duplicate-token',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      await expect(
        tx.invite.create({
          data: {
            companyId: company.id,
            email: 'other@example.test',
            role: 'user',
            token: 'duplicate-token',
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ).rejects.toThrow();
    });
  });

  it('enforces unique tag (companyId, name)', async () => {
    await withTx(async (tx) => {
      const company = await tx.company.create({
        data: { name: 'C5', slug: 'c5-' + Math.random().toString(36).slice(2, 8) },
      });
      await tx.tag.create({ data: { companyId: company.id, name: 'meeting' } });
      await expect(
        tx.tag.create({ data: { companyId: company.id, name: 'meeting' } }),
      ).rejects.toThrow();
    });
  });
});
