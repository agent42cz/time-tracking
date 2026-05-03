/**
 * Phase 2 — Auth signup tests.
 * Covers US-1, US-2.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import {
  acceptInviteAsExistingUser,
  acceptInviteAsNewUser,
  createInvite,
} from '../../src/lib/auth/signup.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe('invite-only signup', () => {
  it('US-1: visitor opens invite link, creates account, joins company in one flow', async () => {
    await withTx(async (tx) => {
      const company = await tx.company.create({ data: { name: 'Acme', slug: 'acme-us1' } });
      await createInvite(tx, {
        companyId: company.id,
        email: 'newbie@example.test',
        role: 'user',
        invitedById: undefined as unknown as string, // no admin needed for this unit
        expiresAt: FUTURE(),
        token: 'invite-token-us1',
      });

      const result = await acceptInviteAsNewUser(tx, {
        token: 'invite-token-us1',
        fullName: 'Newbie Person',
        password: 'CorrectHorseBattery42!',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.created).toBe(true);
      expect(result.role).toBe('user');

      const user = await tx.user.findUniqueOrThrow({ where: { id: result.userId } });
      expect(user.passwordHash).toBeTruthy();
      const membership = await tx.membership.findUniqueOrThrow({
        where: { userId_companyId: { userId: result.userId, companyId: company.id } },
      });
      expect(membership.role).toBe('user');
      const invite = await tx.invite.findUniqueOrThrow({ where: { token: 'invite-token-us1' } });
      expect(invite.status).toBe('accepted');
      expect(invite.acceptedAt).toBeInstanceOf(Date);
    });
  });

  it('US-2: existing user with invite link is added to the new company without a second account', async () => {
    await withTx(async (tx) => {
      const existingUser = await tx.user.create({
        data: { email: 'existing@example.test', fullName: 'Existing', passwordHash: 'x' },
      });
      const company = await tx.company.create({ data: { name: 'Acme2', slug: 'acme-us2' } });
      await createInvite(tx, {
        companyId: company.id,
        email: 'existing@example.test',
        role: 'admin',
        invitedById: undefined as unknown as string,
        expiresAt: FUTURE(),
        token: 'invite-token-us2',
      });

      const result = await acceptInviteAsExistingUser(tx, {
        token: 'invite-token-us2',
        userId: existingUser.id,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.created).toBe(false);

      const totalUsers = await tx.user.count();
      expect(totalUsers).toBe(1); // no duplicate user
      const membership = await tx.membership.findUniqueOrThrow({
        where: { userId_companyId: { userId: existingUser.id, companyId: company.id } },
      });
      expect(membership.role).toBe('admin');
    });
  });

  it('rejects expired invites', async () => {
    await withTx(async (tx) => {
      const company = await tx.company.create({ data: { name: 'Acme3', slug: 'acme-exp' } });
      await createInvite(tx, {
        companyId: company.id,
        email: 'late@example.test',
        role: 'user',
        invitedById: undefined as unknown as string,
        expiresAt: new Date(Date.now() - 1000),
        token: 'invite-token-exp',
      });

      const result = await acceptInviteAsNewUser(tx, {
        token: 'invite-token-exp',
        fullName: 'Late',
        password: 'CorrectHorseBattery42!',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('expired');
    });
  });

  it('rejects double-redeem', async () => {
    await withTx(async (tx) => {
      const company = await tx.company.create({ data: { name: 'Acme4', slug: 'acme-dbl' } });
      await createInvite(tx, {
        companyId: company.id,
        email: 'dbl@example.test',
        role: 'user',
        invitedById: undefined as unknown as string,
        expiresAt: FUTURE(),
        token: 'invite-token-dbl',
      });

      const first = await acceptInviteAsNewUser(tx, {
        token: 'invite-token-dbl',
        fullName: 'First',
        password: 'CorrectHorseBattery42!',
      });
      expect(first.ok).toBe(true);

      const second = await acceptInviteAsNewUser(tx, {
        token: 'invite-token-dbl',
        fullName: 'Second',
        password: 'CorrectHorseBattery42!',
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toBe('already_accepted');
    });
  });
});
