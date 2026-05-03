/**
 * Token generation + hashing for invites, magic links, and recovery codes.
 *
 * - Tokens are 32 random bytes, URL-safe base64 — high entropy (256 bits).
 * - Stored as a SHA-256 hash; we never persist plaintext for invites/magic
 *   links/recovery codes. The plaintext is shown to the user (or sent via
 *   email) once and never recoverable from the DB. This prevents read-only
 *   DB compromise from yielding usable tokens.
 */
import { createHash, randomBytes } from 'node:crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Recovery codes — 10 codes per enrollment, format `XXXXX-XXXXX` (10 chars).
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(8).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}
