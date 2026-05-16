/**
 * User settings tests.
 * Covers US-64: enabling auto-stack setting.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

describe('user settings', () => {
  it('US-64: user can enable auto-stack overlapping entries setting', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: 'test-user@example.test',
          fullName: 'Test User',
          passwordHash: 'hash',
          autoStackOverlaps: false, // default
        },
      });

      // User enables the setting
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { autoStackOverlaps: true },
      });

      expect(updated.autoStackOverlaps).toBe(true);

      // Verify persistence
      const reloaded = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reloaded.autoStackOverlaps).toBe(true);
    });
  });

  it('US-64: auto-stack setting defaults to false for new users', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: 'new-user@example.test',
          fullName: 'New User',
          passwordHash: 'hash',
        },
      });

      expect(user.autoStackOverlaps).toBe(false);
    });
  });

  it('US-64: user can disable auto-stack after enabling', async () => {
    await withTx(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: 'toggle-user@example.test',
          fullName: 'Toggle User',
          passwordHash: 'hash',
          autoStackOverlaps: true,
        },
      });

      const disabled = await tx.user.update({
        where: { id: user.id },
        data: { autoStackOverlaps: false },
      });

      expect(disabled.autoStackOverlaps).toBe(false);
    });
  });
});
