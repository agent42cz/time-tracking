/**
 * AIAGE-39 — post-login redirect target validation (open-redirect guard).
 */
import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../../src/lib/auth/safe-next.js';

describe('safeNextPath', () => {
  it('US-3: passes through a normal same-origin path', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
    expect(safeNextPath('/timer?day=2026-06-11')).toBe('/timer?day=2026-06-11');
  });

  it('US-3: falls back to /timer for empty or external targets', () => {
    expect(safeNextPath(null)).toBe('/timer');
    expect(safeNextPath(undefined)).toBe('/timer');
    expect(safeNextPath('')).toBe('/timer');
    expect(safeNextPath('https://evil.example.com')).toBe('/timer');
    expect(safeNextPath('evil.example.com')).toBe('/timer');
  });

  it('US-3: blocks protocol-relative and backslash open-redirect tricks', () => {
    expect(safeNextPath('//evil.example.com')).toBe('/timer');
    // Browsers normalize backslashes to slashes, so /\evil.com == //evil.com.
    expect(safeNextPath('/\\evil.example.com')).toBe('/timer');
    expect(safeNextPath('\\/evil.example.com')).toBe('/timer');
    expect(safeNextPath('/timer\\..\\x')).toBe('/timer');
  });
});
