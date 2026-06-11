/**
 * AIAGE-39 — rate limit for outbound auth emails (password reset + magic link).
 * Prevents email bombing: per-email and per-IP sliding window, counted across
 * both kinds so alternating reset/magic-link doesn't double the budget.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import {
  EMAIL_SEND_WINDOW_MS,
  MAX_SENDS_PER_EMAIL,
  MAX_SENDS_PER_IP,
  checkEmailSendAllowed,
  recordEmailSend,
} from '../../src/lib/auth/email-rate-limit.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

const T0 = new Date('2026-06-11T10:00:00Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

describe('email send rate limit', () => {
  it('US-3: allows sending a reset email under the limit', async () => {
    await withTx(async (tx) => {
      const r = await checkEmailSendAllowed(tx, { email: 'a@example.test', ip: '10.0.0.1' }, T0);
      expect(r.allowed).toBe(true);
      await recordEmailSend(
        tx,
        { kind: 'password_reset', email: 'a@example.test', ip: '10.0.0.1' },
        T0,
      );
      const again = await checkEmailSendAllowed(
        tx,
        { email: 'a@example.test', ip: '10.0.0.1' },
        at(1000),
      );
      expect(again.allowed).toBe(true);
    });
  });

  it('US-3: blocks the same email after MAX_SENDS_PER_EMAIL within the window', async () => {
    await withTx(async (tx) => {
      for (let i = 0; i < MAX_SENDS_PER_EMAIL; i++) {
        await recordEmailSend(
          tx,
          // Different IPs: this exercises the per-email dimension alone.
          { kind: 'password_reset', email: 'victim@example.test', ip: `10.0.1.${i}` },
          at(i * 1000),
        );
      }
      const r = await checkEmailSendAllowed(
        tx,
        { email: 'victim@example.test', ip: '10.0.2.99' },
        at(60_000),
      );
      expect(r.allowed).toBe(false);
    });
  });

  it('US-3: blocks one IP across different target emails after MAX_SENDS_PER_IP', async () => {
    await withTx(async (tx) => {
      for (let i = 0; i < MAX_SENDS_PER_IP; i++) {
        await recordEmailSend(
          tx,
          { kind: 'magic_link', email: `target${i}@example.test`, ip: '203.0.113.7' },
          at(i * 1000),
        );
      }
      const r = await checkEmailSendAllowed(
        tx,
        { email: 'fresh@example.test', ip: '203.0.113.7' },
        at(60_000),
      );
      expect(r.allowed).toBe(false);
    });
  });

  it('US-3: counts reset and magic-link sends against the same per-email budget', async () => {
    await withTx(async (tx) => {
      for (let i = 0; i < MAX_SENDS_PER_EMAIL; i++) {
        await recordEmailSend(
          tx,
          {
            kind: i % 2 === 0 ? 'password_reset' : 'magic_link',
            email: 'mixed@example.test',
            ip: `10.0.3.${i}`,
          },
          at(i * 1000),
        );
      }
      const r = await checkEmailSendAllowed(
        tx,
        { email: 'mixed@example.test', ip: '10.0.4.1' },
        at(60_000),
      );
      expect(r.allowed).toBe(false);
    });
  });

  it('US-3: allows again once the window has passed', async () => {
    await withTx(async (tx) => {
      for (let i = 0; i < MAX_SENDS_PER_EMAIL; i++) {
        await recordEmailSend(
          tx,
          { kind: 'password_reset', email: 'later@example.test', ip: '10.0.5.1' },
          at(i * 1000),
        );
      }
      const blocked = await checkEmailSendAllowed(
        tx,
        { email: 'later@example.test', ip: '10.0.5.1' },
        at(60_000),
      );
      expect(blocked.allowed).toBe(false);
      const afterWindow = await checkEmailSendAllowed(
        tx,
        { email: 'later@example.test', ip: '10.0.5.1' },
        at(EMAIL_SEND_WINDOW_MS + MAX_SENDS_PER_EMAIL * 1000 + 1000),
      );
      expect(afterWindow.allowed).toBe(true);
    });
  });

  it('US-3: a null IP still enforces the per-email limit and never blocks other senders', async () => {
    await withTx(async (tx) => {
      for (let i = 0; i < MAX_SENDS_PER_EMAIL; i++) {
        await recordEmailSend(
          tx,
          { kind: 'password_reset', email: 'noip@example.test', ip: null },
          at(i * 1000),
        );
      }
      const blocked = await checkEmailSendAllowed(
        tx,
        { email: 'noip@example.test', ip: null },
        at(60_000),
      );
      expect(blocked.allowed).toBe(false);
      // Null IPs must not pool together into a shared bucket.
      const other = await checkEmailSendAllowed(
        tx,
        { email: 'other@example.test', ip: null },
        at(60_000),
      );
      expect(other.allowed).toBe(true);
    });
  });
});
