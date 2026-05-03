/**
 * TOTP — Google Authenticator / Authy / 1Password compatible.
 *
 * Wraps `otplib` with our naming and ensures the issuer label matches the app.
 * The verification function intentionally accepts a tiny window (±1 step) to
 * smooth clock skew without weakening security.
 */
import { authenticator } from 'otplib';

authenticator.options = { window: 1, step: 30, digits: 6 };

const ISSUER = 'TimeTracker';

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function buildTotpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}

export function generateTotpCode(secret: string): string {
  return authenticator.generate(secret);
}
