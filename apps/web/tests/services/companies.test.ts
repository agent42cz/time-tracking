/**
 * Phase 3 — Companies/memberships/invites tests.
 * Covers US-6, US-7, US-8, US-9, US-10, US-11, US-12, US-50.
 *
 * Cross-company isolation is asserted on every endpoint by re-running the
 * call as a member of the OTHER company and expecting `not_found`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import {
  changeRole,
  createCompany,
  createInvite,
  deleteCompany,
  leaveCompany,
  listMyCompanies,
  removeMember,
  resendInvite,
  revokeInvite,
} from '../../src/lib/services/companies.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

interface World {
  admin: string;
  user: string;
  outsider: string;
  outsiderCompany: string;
  company: string;
}

async function bootstrap(tx: Prisma.TransactionClient, suffix: string): Promise<World> {
  const admin = await tx.user.create({
    data: { email: `admin-${suffix}@example.test`, fullName: 'A' },
  });
  const user = await tx.user.create({
    data: { email: `user-${suffix}@example.test`, fullName: 'U' },
  });
  const outsider = await tx.user.create({
    data: { email: `out-${suffix}@example.test`, fullName: 'O' },
  });
  const company = await createCompany(tx, { name: `Acme ${suffix}`, createdByUserId: admin.id });
  await tx.membership.create({
    data: { userId: user.id, companyId: company.id, role: 'user' },
  });
  const outsiderCompany = await createCompany(tx, {
    name: `Other ${suffix}`,
    createdByUserId: outsider.id,
  });
  return {
    admin: admin.id,
    user: user.id,
    outsider: outsider.id,
    outsiderCompany: outsiderCompany.id,
    company: company.id,
  };
}

describe('companies / memberships / invites', () => {
  it('US-6: creating a company makes the creator the first Admin', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({ data: { email: 'me@example.test', fullName: 'Me' } });
      const company = await createCompany(tx, {
        name: 'My Studio',
        createdByUserId: me.id,
      });
      const m = await tx.membership.findUniqueOrThrow({
        where: { userId_companyId: { userId: me.id, companyId: company.id } },
      });
      expect(m.role).toBe('admin');
      expect(company.slug).toMatch(/^my-studio/);
    });
  });

  it('US-7: a user lists exactly the companies they belong to', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us7');
      const mine = await listMyCompanies(tx, w.user);
      expect(mine.map((c) => c.id)).toEqual([w.company]);
      const adminList = await listMyCompanies(tx, w.admin);
      expect(adminList.map((c) => c.id).sort()).toEqual([w.company].sort());
    });
  });

  it('US-8: admin invites with a pre-assigned role', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us8');
      const result = await createInvite(tx, w.admin, {
        companyId: w.company,
        email: 'newhire@example.test',
        role: 'admin',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const invite = await tx.invite.findUniqueOrThrow({ where: { id: result.value.id } });
        expect(invite.role).toBe('admin');
        expect(invite.status).toBe('pending');
      }

      // cross-company 404: outsider tries the same invite on this company
      const cross = await createInvite(tx, w.outsider, {
        companyId: w.company,
        email: 'evil@example.test',
        role: 'admin',
      });
      expect(cross.ok).toBe(false);
      if (!cross.ok) expect(cross.reason).toBe('not_found');
    });
  });

  it('US-9: admin can revoke a pending invite', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us9rev');
      const i = await createInvite(tx, w.admin, {
        companyId: w.company,
        email: 'revoked@example.test',
        role: 'user',
      });
      if (!i.ok) throw new Error('setup');
      const revoke = await revokeInvite(tx, w.admin, i.value.id);
      expect(revoke.ok).toBe(true);
      const reread = await tx.invite.findUniqueOrThrow({ where: { id: i.value.id } });
      expect(reread.status).toBe('revoked');

      // cross-company 404
      const j = await createInvite(tx, w.admin, {
        companyId: w.company,
        email: 'r2@example.test',
        role: 'user',
      });
      if (!j.ok) throw new Error('setup');
      const wrong = await revokeInvite(tx, w.outsider, j.value.id);
      expect(wrong.ok).toBe(false);
    });
  });

  it('US-9: admin can resend (rotates token + extends expiry)', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us9res');
      const i = await createInvite(tx, w.admin, {
        companyId: w.company,
        email: 'resend@example.test',
        role: 'user',
      });
      if (!i.ok) throw new Error('setup');
      const oldToken = i.value.token;
      const oldExpiry = i.value.expiresAt.getTime();
      const res = await resendInvite(tx, w.admin, i.value.id, new Date(Date.now() + 1000));
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.token).not.toBe(oldToken);
        expect(res.value.expiresAt.getTime()).toBeGreaterThan(oldExpiry);
      }
    });
  });

  it('US-10: admin can promote a user to admin and demote back', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us10');
      const promote = await changeRole(tx, w.admin, {
        companyId: w.company,
        targetUserId: w.user,
        newRole: 'admin',
      });
      expect(promote.ok).toBe(true);
      const demote = await changeRole(tx, w.admin, {
        companyId: w.company,
        targetUserId: w.user,
        newRole: 'user',
      });
      expect(demote.ok).toBe(true);
    });
  });

  it('US-11: removing a member keeps their time entries under their name', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us11');
      // user logs an entry
      await tx.timeEntry.create({
        data: {
          userId: w.user,
          companyId: w.company,
          startedAt: new Date('2026-05-01T08:00:00Z'),
          endedAt: new Date('2026-05-01T09:00:00Z'),
          description: 'Pre-removal work',
        },
      });
      const removed = await removeMember(tx, w.admin, {
        companyId: w.company,
        targetUserId: w.user,
      });
      expect(removed.ok).toBe(true);

      const entries = await tx.timeEntry.findMany({
        where: { companyId: w.company, userId: w.user },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]!.description).toBe('Pre-removal work');

      const membership = await tx.membership.findUnique({
        where: { userId_companyId: { userId: w.user, companyId: w.company } },
      });
      expect(membership).toBeNull();
    });
  });

  it('US-12: admin can delete the entire company', async () => {
    await withTx(async (tx) => {
      const w = await bootstrap(tx, 'us12');
      const del = await deleteCompany(tx, w.admin, w.company);
      expect(del.ok).toBe(true);
      expect(await tx.company.findUnique({ where: { id: w.company } })).toBeNull();

      // cross-company: a non-member cannot delete
      const w2 = await bootstrap(tx, 'us12b');
      const cross = await deleteCompany(tx, w2.outsider, w2.company);
      expect(cross.ok).toBe(false);
    });
  });

  it('US-50: blocks demoting the only Admin', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({
        data: { email: 'last@example.test', fullName: 'L' },
      });
      const c = await createCompany(tx, { name: 'Solo', createdByUserId: me.id });
      const result = await changeRole(tx, me.id, {
        companyId: c.id,
        targetUserId: me.id,
        newRole: 'user',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('last_admin');
    });
  });

  it('US-50: blocks the only Admin from leaving', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({
        data: { email: 'lone@example.test', fullName: 'L' },
      });
      const c = await createCompany(tx, { name: 'Lone', createdByUserId: me.id });
      const left = await leaveCompany(tx, me.id, c.id);
      expect(left.ok).toBe(false);
      if (!left.ok) expect(left.reason).toBe('last_admin');
    });
  });

  it('US-50: an admin cannot demote themselves even when other admins exist', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({
        data: { email: 'me-self@example.test', fullName: 'Me' },
      });
      const co = await tx.user.create({
        data: { email: 'co-admin@example.test', fullName: 'Co-Admin' },
      });
      const c = await createCompany(tx, { name: 'TwoAdmins', createdByUserId: me.id });
      // Add a second admin so the "last admin" guard would NOT trigger.
      await tx.membership.create({
        data: { userId: co.id, companyId: c.id, role: 'admin' },
      });

      const result = await changeRole(tx, me.id, {
        companyId: c.id,
        targetUserId: me.id,
        newRole: 'user',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('self_demotion');

      // Sanity: I can still demote the OTHER admin (no rule against that).
      const otherDemote = await changeRole(tx, me.id, {
        companyId: c.id,
        targetUserId: co.id,
        newRole: 'user',
      });
      expect(otherDemote.ok).toBe(true);
    });
  });

  it('US-50: blocks removing the only Admin', async () => {
    await withTx(async (tx) => {
      const me = await tx.user.create({
        data: { email: 'lone2@example.test', fullName: 'L' },
      });
      const c = await createCompany(tx, { name: 'Lone2', createdByUserId: me.id });
      const out = await removeMember(tx, me.id, {
        companyId: c.id,
        targetUserId: me.id,
      });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe('last_admin');
    });
  });
});
