import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../src/lib/services/companies.js';
import { issueToken, revokeToken } from '../../../src/lib/services/api-tokens.js';
import { authenticateRequest } from '../../../src/server/mcp/authenticate.js';
import { resetMcpRateLimitForTests } from '../../../src/server/mcp/rate-limit.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);
beforeEach(() => resetMcpRateLimitForTests());

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `mca-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `MCA ${suffix}`, createdByUserId: u.id });
  // createCompany returns { id, slug } — use the id
  const companyId = typeof c === 'string' ? c : c.id;
  const t = await issueToken(tx, u.id, { companyId, name: 'K' });
  if (!t.ok) throw new Error('setup');
  return { userId: u.id, companyId, plaintext: t.value.plaintext, tokenId: t.value.id };
}

function req(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('mcp authenticate', () => {
  it('401 on missing header', async () => {
    const r = await authenticateRequest(req(), { db: await getTestPrisma() });
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it('401 on malformed bearer', async () => {
    const r = await authenticateRequest(req('Bearer notatoken'), { db: await getTestPrisma() });
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it('US-55: succeeds with a valid token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'ok');
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).not.toBeInstanceOf(Response);
      if (r instanceof Response) return;
      expect(r.userId).toBe(w.userId);
      expect(r.companyId).toBe(w.companyId);
      expect(r.tokenId).toBe(w.tokenId);
    });
  });

  it('US-62: 401 for a revoked token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv');
      await revokeToken(tx, w.userId, w.tokenId);
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).toBeInstanceOf(Response);
      if (r instanceof Response) expect(r.status).toBe(401);
    });
  });

  it('US-63: 429 with Retry-After when over the rate limit', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rl');
      for (let i = 0; i < 60; i++) {
        const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
        if (r instanceof Response) throw new Error(`unexpected 4xx at i=${i}: ${r.status}`);
      }
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).toBeInstanceOf(Response);
      if (r instanceof Response) {
        expect(r.status).toBe(429);
        expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
      }
    });
  });
});
