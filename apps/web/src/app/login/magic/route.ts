import { NextResponse } from 'next/server';
import { SESSION_LIFETIME_MS } from '@/lib/auth/sessions';
import { loginWithMagicLink } from '@/lib/auth/login';
import { prisma, SESSION_COOKIE } from '@/lib/session';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/login?magic_error=missing', url));
  }
  const result = await loginWithMagicLink(prisma(), { token });
  if (!result.ok) {
    const err = result.reason === 'totp_required' ? 'totp' : 'invalid';
    return NextResponse.redirect(new URL(`/login?magic_error=${err}`, url));
  }
  const res = NextResponse.redirect(new URL('/timer', url));
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_LIFETIME_MS / 1000,
  });
  return res;
}
