import type { NextRequest } from 'next/server';
import { loginWithPassword } from '@/lib/auth/login';
import { prisma } from '@/lib/session';
import { corsPreflight, errorCors, jsonCors } from '@/lib/api/cors';
import { checkIpRateLimit } from '@/lib/api/rate-limit-ip';
import { clientIpFrom } from '@/lib/auth/client-ip';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest): Response {
  return corsPreflight(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  const ip = clientIpFrom(req.headers);
  const bucket = await checkIpRateLimit(ip);
  if (!bucket.ok) {
    return errorCors(req, 429, 'too_many_requests');
  }
  let body: { email?: string; password?: string; totpCode?: string };
  try {
    body = await req.json();
  } catch {
    return errorCors(req, 400, 'invalid_json');
  }
  if (!body.email || !body.password) {
    return errorCors(req, 400, 'email_and_password_required');
  }
  const result = await loginWithPassword(prisma(), {
    email: body.email,
    password: body.password,
    totpCode: body.totpCode,
    ip,
  });
  if (!result.ok) {
    const status = result.reason === 'locked' ? 423 : 401;
    return errorCors(req, status, result.reason);
  }
  return jsonCors(req, {
    token: result.sessionToken,
    expiresAt: result.expiresAt.toISOString(),
    userId: result.userId,
  });
}
