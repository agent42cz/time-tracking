import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkMcpRateLimit,
  resetMcpRateLimitForTests,
} from '../../../src/server/mcp/rate-limit.js';

describe('mcp rate limit', () => {
  beforeEach(() => resetMcpRateLimitForTests());

  it('US-63: allows up to 60 calls/min/token, then blocks until the next bucket', async () => {
    const tokenId = 't1';
    for (let i = 0; i < 60; i++) {
      const r = await checkMcpRateLimit(tokenId);
      expect(r.ok).toBe(true);
    }
    const r = await checkMcpRateLimit(tokenId);
    expect(r.ok).toBe(false);
    expect(r.resetIn).toBeGreaterThanOrEqual(1);
    expect(r.resetIn).toBeLessThanOrEqual(60);
  });

  it('isolates buckets per token', async () => {
    for (let i = 0; i < 60; i++) await checkMcpRateLimit('a');
    const a = await checkMcpRateLimit('a');
    const b = await checkMcpRateLimit('b');
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
  });
});
