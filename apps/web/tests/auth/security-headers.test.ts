/**
 * AIAGE-39 — HTTP security headers are configured for every route.
 * Asserts against the exported config so a refactor can't silently drop them.
 */
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../next.config.mjs';

describe('security headers', () => {
  it('US-3: login (and all routes) ship HSTS, clickjacking and sniffing protections', () => {
    const byKey = Object.fromEntries(
      securityHeaders.map((h: { key: string; value: string }) => [h.key, h.value]),
    );
    expect(byKey['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['Permissions-Policy']).toBeTruthy();
  });
});
