/**
 * CORS for the /api/v1/* surface.
 *
 * Allowlist (origin must match exactly):
 *   - APP_URL env (the web app's own origin)
 *   - any chrome-extension://* (extension IDs are unstable in dev; auth is
 *     bearer-token + the manifest's host_permissions gates which servers the
 *     extension is allowed to talk to)
 *   - any extra origins in CORS_EXTRA_ORIGINS (comma-separated)
 *
 * Origins outside the allowlist receive responses without CORS headers — the
 * browser then blocks the cross-origin request. Server-to-server callers
 * (no Origin header) are unaffected.
 */
import { NextResponse } from 'next/server';

function allowlistedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith('chrome-extension://')) return origin;
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  if (appUrl && origin === appUrl) return origin;
  const extras = (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (extras.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowlistedOrigin(origin);
  if (!allowed) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function corsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export function withCors(req: Request, res: Response): Response {
  const headers = corsHeaders(req.headers.get('origin'));
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export function jsonCors<T>(req: Request, body: T, init?: ResponseInit): Response {
  return withCors(req, NextResponse.json(body, init));
}

export function errorCors(req: Request, status: number, error: string): Response {
  return jsonCors(req, { error }, { status });
}
