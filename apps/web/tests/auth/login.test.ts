/**
 * Phase 2 — Login tests. Covers US-3, US-4, US-5.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { hashPassword } from '../../src/lib/auth/passwords.js';
import { issueMagicLink } from '../../src/lib/auth/magic-link.js';
import {
  beginEnrollment,
  confirmEnrollment,
  verifyTwoFactor,
} from '../../src/lib/auth/totp-enrollment.js';
import { generateTotpCode } from '../../src/lib/auth/totp.js';
import { loginWithMagicLink, loginWithPassword } from '../../src/lib/auth/login.js';
import {
  SESSION_LIFETIME_MS,
  SLIDING_THRESHOLD_MS,
  resolveSession,
} from '../../src/lib/auth/sessions.js';
import { LOCKOUT_MS, MAX_FAILURES, getLockoutStatus } from '../../src/lib/auth/rate-limit.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function makeUser(
  tx: Awaited<ReturnType<typeof getTestPrisma>>,
  opts: { email: string; password: string },
): Promise<{ id: string }> {
  const passwordHash = await hashPassword(opts.password);
  return tx.user.create({
    data: { email: opts.email.toLowerCase(), passwordHash, fullName: 'Test' },
    select: { id: true },
  });
}

describe('login', () => {
  it('US-3: logs in with email + password (happy path)', async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { email: 'us3@example.test', password: 'CorrectHorseBattery42!' });
      const result = await loginWithPassword(tx, {
        email: 'us3@example.test',
        password: 'CorrectHorseBattery42!',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.userId).toBe(u.id);
      expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    });
  });

  it('US-3: logs in via magic link', async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, {
        email: 'us3magic@example.test',
        password: 'CorrectHorseBattery42!',
      });
      const link = await issueMagicLink(tx, u.id);
      const result = await loginWithMagicLink(tx, { token: link.token });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.userId).toBe(u.id);
    });
  });

  it('US-3: rejects wrong password', async () => {
    await withTx(async (tx) => {
      await makeUser(tx, {
        email: 'us3wrong@example.test',
        password: 'CorrectHorseBattery42!',
      });
      const result = await loginWithPassword(tx, {
        email: 'us3wrong@example.test',
        password: 'WrongPassword!23',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid_credentials');
    });
  });

  it('US-4: enrolls TOTP and verifies a real code; recovery code is single-use', async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { email: 'us4@example.test', password: 'CorrectHorseBattery42!' });
      const enroll = await beginEnrollment(tx, u.id);
      expect(enroll.otpauthUrl).toContain('TimeTracker');

      const validCode = generateTotpCode(enroll.secret);
      const confirmed = await confirmEnrollment(tx, u.id, validCode);
      expect(confirmed.recoveryCodes).toHaveLength(10);

      // After enrollment, login with password requires totp_required first.
      const noTotp = await loginWithPassword(tx, {
        email: 'us4@example.test',
        password: 'CorrectHorseBattery42!',
      });
      expect(noTotp.ok).toBe(false);
      if (!noTotp.ok) expect(noTotp.reason).toBe('totp_required');

      // Login with valid TOTP succeeds.
      const goodTotp = await loginWithPassword(tx, {
        email: 'us4@example.test',
        password: 'CorrectHorseBattery42!',
        totpCode: generateTotpCode(enroll.secret),
      });
      expect(goodTotp.ok).toBe(true);

      // A recovery code works once.
      const code = confirmed.recoveryCodes[0]!;
      const r1 = await verifyTwoFactor(tx, u.id, code);
      expect(r1.ok).toBe(true);
      if (r1.ok) expect(r1.via).toBe('recovery');
      const r2 = await verifyTwoFactor(tx, u.id, code);
      expect(r2.ok).toBe(false);
    });
  });

  it('US-5: session lasts 30 days; renews when within sliding threshold', async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { email: 'us5@example.test', password: 'CorrectHorseBattery42!' });
      const t0 = new Date('2026-05-01T00:00:00Z');
      const result = await loginWithPassword(
        tx,
        { email: 'us5@example.test', password: 'CorrectHorseBattery42!' },
        t0,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Initial expiry is 30 days out.
      expect(result.expiresAt.getTime() - t0.getTime()).toBe(SESSION_LIFETIME_MS);

      // Resolving 24 days later (within 7-day sliding window) renews.
      const t1 = new Date(t0.getTime() + 24 * 24 * 60 * 60 * 1000);
      const r1 = await resolveSession(tx, result.sessionToken, t1);
      expect(r1).toBeTruthy();
      expect(r1?.renewed).toBe(true);
      expect(r1!.expiresAt.getTime() - t1.getTime()).toBe(SESSION_LIFETIME_MS);

      // Resolving 5 days later (well outside sliding threshold from new expiry) doesn't renew.
      const t2 = new Date(t1.getTime() + 5 * 24 * 60 * 60 * 1000);
      const r2 = await resolveSession(tx, result.sessionToken, t2);
      expect(r2?.renewed).toBe(false);
      // Sanity: confirms the threshold is actually 7 days.
      expect(SLIDING_THRESHOLD_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  it('locks the account after MAX_FAILURES wrong passwords', async () => {
    await withTx(async (tx) => {
      await makeUser(tx, { email: 'lock@example.test', password: 'CorrectHorseBattery42!' });
      for (let i = 0; i < MAX_FAILURES; i++) {
        const r = await loginWithPassword(tx, {
          email: 'lock@example.test',
          password: 'wrong',
        });
        expect(r.ok).toBe(false);
      }
      const status = await getLockoutStatus(tx, 'lock@example.test');
      expect(status.locked).toBe(true);
      expect(status.unlocksAt!.getTime()).toBeGreaterThan(Date.now());
      expect(status.unlocksAt!.getTime() - Date.now()).toBeLessThanOrEqual(LOCKOUT_MS + 1000);

      // Even with the right password, login is blocked while locked.
      const blocked = await loginWithPassword(tx, {
        email: 'lock@example.test',
        password: 'CorrectHorseBattery42!',
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.reason).toBe('locked');
    });
  });
});
