/**
 * Token-based session resolution for the cross-origin REST API used by
 * the Chrome extension (and future API clients).
 *
 * Reads `Authorization: Bearer <token>` from the request. Falls back to
 * the `tt-session` cookie when present so the same routes can serve
 * server-rendered web requests if needed. Returns a fully-resolved
 * ActiveSession (same shape as `getSession()`) or null.
 */
import 'server-only';
import type { NextRequest } from 'next/server';
import type { Role } from '@prisma/client';
import { resolveSession } from '../auth/sessions.js';
import { COMPANY_COOKIE, prisma, SESSION_COOKIE } from '../session.js';

export type ThemePreference = 'light' | 'dark' | 'system';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export interface ApiSession {
  userId: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  theme: ThemePreference;
  autoStackOverlaps: boolean;
  /**
   * How this request authenticated: a bearer token (the extension's REST
   * client) vs. the `tt-session` cookie (a same-origin web request). Used by
   * US-104 diagnostics to tag which surface performed a timer mutation
   * without relying on any client-supplied value.
   */
  authSource: 'web' | 'extension';
  /**
   * `tt-company` cookie, when present. Web timer/dashboard fetches omit
   * `?company=` and rely on this; bearer (extension) requests ignore it.
   */
  cookieCompanyId: string | null;
  memberships: { companyId: string; companyName: string; companySlug: string; role: Role }[];
}

export async function resolveApiSession(req: NextRequest): Promise<ApiSession | null> {
  const auth = req.headers.get('authorization');
  let token: string | null = null;
  let authSource: 'web' | 'extension' = 'web';
  if (auth) {
    const m = /^bearer\s+(.+)$/i.exec(auth.trim());
    if (m) {
      token = m[1]!;
      authSource = 'extension';
    }
  }
  if (!token) {
    token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
  }
  if (!token) return null;
  const resolved = await resolveSession(prisma(), token);
  if (!resolved) return null;
  const user = await prisma().user.findUnique({
    where: { id: resolved.userId },
    include: { memberships: { include: { company: true } } },
  });
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    totpEnabled: user.totpEnabled,
    theme: isThemePreference(user.theme) ? user.theme : 'system',
    autoStackOverlaps: user.autoStackOverlaps,
    authSource,
    cookieCompanyId: req.cookies.get(COMPANY_COOKIE)?.value ?? null,
    memberships: user.memberships.map((m) => ({
      companyId: m.companyId,
      companyName: m.company.name,
      companySlug: m.company.slug,
      role: m.role,
    })),
  };
}

export function pickActiveCompany(
  session: ApiSession,
  preferred: string | null,
): { companyId: string; role: Role } | null {
  if (preferred !== null) {
    const named = session.memberships.find((mm) => mm.companyId === preferred);
    return named ? { companyId: named.companyId, role: named.role } : null;
  }
  // Cookie-authenticated web fetches (timer refetch, favicon) omit `?company=`
  // and would otherwise silently snap back to the first membership.
  if (session.authSource === 'web' && session.cookieCompanyId) {
    const fromCookie = session.memberships.find((mm) => mm.companyId === session.cookieCompanyId);
    if (fromCookie) return { companyId: fromCookie.companyId, role: fromCookie.role };
  }
  const fallback = session.memberships[0];
  if (!fallback) return null;
  return { companyId: fallback.companyId, role: fallback.role };
}
