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
import { prisma, SESSION_COOKIE } from '../session.js';

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
  memberships: { companyId: string; companyName: string; companySlug: string; role: Role }[];
}

export async function resolveApiSession(req: NextRequest): Promise<ApiSession | null> {
  const auth = req.headers.get('authorization');
  let token: string | null = null;
  if (auth) {
    const m = /^bearer\s+(.+)$/i.exec(auth.trim());
    if (m) token = m[1]!;
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
  const m =
    (preferred && session.memberships.find((mm) => mm.companyId === preferred)) ||
    session.memberships[0];
  if (!m) return null;
  return { companyId: m.companyId, role: m.role };
}
