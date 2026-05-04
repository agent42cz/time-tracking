/**
 * Server-side session helpers. Reads the `tt-session` HTTP-only cookie,
 * resolves it via `resolveSession`, and returns the user + active company.
 *
 * Active company is stored in a separate `tt-company` cookie so
 * switching is a one-cookie-write that doesn't touch the session.
 *
 * `requireUser()` redirects to /login if no session.
 * `requireAdmin()` returns the membership row for the active company
 * (404 → not_found if outsider, redirect to /companies if no active).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PrismaClient, type Role } from '@prisma/client';
import { resolveSession, SESSION_LIFETIME_MS } from './auth/sessions.js';

export const SESSION_COOKIE = 'tt-session';
export const COMPANY_COOKIE = 'tt-company';

let _prisma: PrismaClient | undefined;
export function prisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export interface ActiveSession {
  userId: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  activeCompanyId: string | null;
  activeRole: Role | null;
  memberships: { companyId: string; companyName: string; companySlug: string; role: Role }[];
}

export async function getSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const resolved = await resolveSession(prisma(), token);
  if (!resolved) return null;
  const user = await prisma().user.findUnique({
    where: { id: resolved.userId },
    include: { memberships: { include: { company: true } } },
  });
  if (!user) return null;

  const cookieCompany = jar.get(COMPANY_COOKIE)?.value ?? null;
  const memberships = user.memberships.map((m) => ({
    companyId: m.companyId,
    companyName: m.company.name,
    companySlug: m.company.slug,
    role: m.role,
  }));
  let activeCompanyId: string | null = null;
  let activeRole: Role | null = null;
  if (cookieCompany && memberships.find((m) => m.companyId === cookieCompany)) {
    activeCompanyId = cookieCompany;
    activeRole = memberships.find((m) => m.companyId === cookieCompany)!.role;
  } else if (memberships.length > 0) {
    activeCompanyId = memberships[0]!.companyId;
    activeRole = memberships[0]!.role;
  }
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    totpEnabled: user.totpEnabled,
    activeCompanyId,
    activeRole,
    memberships,
  };
}

export async function requireUser(): Promise<ActiveSession> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function requireActiveCompany(): Promise<
  ActiveSession & { activeCompanyId: string; activeRole: Role }
> {
  const s = await requireUser();
  if (!s.activeCompanyId || !s.activeRole) redirect('/companies');
  return s as ActiveSession & { activeCompanyId: string; activeRole: Role };
}

export async function requireAdmin(): Promise<
  ActiveSession & { activeCompanyId: string; activeRole: 'admin' }
> {
  const s = await requireActiveCompany();
  if (s.activeRole !== 'admin') redirect('/timer');
  return s as ActiveSession & { activeCompanyId: string; activeRole: 'admin' };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function setActiveCompany(companyId: string | null): Promise<void> {
  const jar = await cookies();
  if (!companyId) jar.delete(COMPANY_COOKIE);
  else
    jar.set(COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_LIFETIME_MS / 1000,
    });
}
