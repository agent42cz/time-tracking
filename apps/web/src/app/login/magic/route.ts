import { NextResponse } from 'next/server';
import { SESSION_LIFETIME_MS } from '@/lib/auth/sessions';
import { loginWithMagicLink } from '@/lib/auth/login';
import { prisma, SESSION_COOKIE } from '@/lib/session';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  // Behind Traefik req.url is internal (localhost:3000); anchor public
  // redirects to APP_URL so the browser follows them on the right host.
  const base = process.env.APP_URL ?? url.origin;
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?magic_error=missing', base));
  }
  const result = await loginWithMagicLink(prisma(), { token });
  if (!result.ok) {
    const err = result.reason === 'totp_required' ? 'totp' : 'invalid';
    return NextResponse.redirect(new URL(`/login?magic_error=${err}`, base));
  }
  const res = NextResponse.redirect(new URL('/timer', base));
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
  return res;
}
