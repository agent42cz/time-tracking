import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  issueToken,
  listTokens,
  revokeToken,
  verifyToken,
} from '../../src/lib/services/api-tokens.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `at-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `AT ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c.id };
}

describe('api tokens', () => {
  it('US-55: issueToken returns plaintext once, stores argon2 hash, and writes one audit row', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '55');
      const before = await tx.auditLog.count();
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'Laptop',
      });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      expect(issued.value.plaintext).toMatch(/^tt_pat_[a-z2-7]{24}$/);
      const row = await tx.apiToken.findUniqueOrThrow({ where: { id: issued.value.id } });
      expect(row.prefix).toBe(issued.value.plaintext.slice(0, 14));
      expect(row.tokenHash).not.toContain(issued.value.plaintext);
      expect(row.revokedAt).toBeNull();
      const after = await tx.auditLog.count();
      expect(after).toBe(before + 1);
    });
  });

  it('verifyToken matches the issued plaintext and rejects mismatch', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'v');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'K',
      });
      if (!issued.ok) throw new Error('setup');

      const ok = await verifyToken(tx, issued.value.plaintext);
      expect(ok.ok).toBe(true);
      if (!ok.ok) return;
      expect(ok.value.userId).toBe(w.userId);
      expect(ok.value.companyId).toBe(w.companyId);

      const bad = await verifyToken(tx, issued.value.plaintext.replace(/.$/, 'a'));
      expect(bad.ok).toBe(false);
    });
  });

  it('US-62: verifyToken rejects a revoked token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'R',
      });
      if (!issued.ok) throw new Error('setup');
      await revokeToken(tx, w.userId, issued.value.id);
      const r = await verifyToken(tx, issued.value.plaintext);
      expect(r.ok).toBe(false);
    });
  });

  it("US-56: listTokens returns the user's tokens with prefix, no hash", async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'l');
      const a = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'A',
      });
      const b = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'B',
      });
      if (!a.ok || !b.ok) throw new Error('setup');
      const list = await listTokens(tx, w.userId);
      expect(list.map((t) => t.name).sort()).toEqual(['A', 'B']);
      expect(Object.keys(list[0] ?? {})).not.toContain('tokenHash');
    });
  });

  it('US-56: revokeToken is idempotent and writes one audit row', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv2');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'R',
      });
      if (!issued.ok) throw new Error('setup');
      const before = await tx.auditLog.count();
      const r1 = await revokeToken(tx, w.userId, issued.value.id);
      expect(r1.ok).toBe(true);
      const r2 = await revokeToken(tx, w.userId, issued.value.id);
      expect(r2.ok).toBe(true);
      const after = await tx.auditLog.count();
      expect(after).toBe(before + 1);
    });
  });

  it("revokeToken refuses to touch another user's token", async () => {
    await withTx(async (tx) => {
      const a = await setup(tx, 'oa');
      const b = await setup(tx, 'ob');
      const issued = await issueToken(tx, a.userId, {
        companyId: a.companyId,
        name: 'A',
      });
      if (!issued.ok) throw new Error('setup');
      const r = await revokeToken(tx, b.userId, issued.value.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not_found');
    });
  });
});
