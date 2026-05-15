import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { verifyToken, touchLastUsed } from '../../lib/services/api-tokens.js';
import { checkMcpRateLimit } from './rate-limit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface McpAuthContext {
  userId: string;
  companyId: string;
  tokenId: string;
}

const UNAUTHORIZED = (): Response =>
  new Response(null, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
  });

export async function authenticateRequest(
  req: Request,
  opts: { db: Db },
): Promise<McpAuthContext | Response> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return UNAUTHORIZED();
  const presented = header.slice('bearer '.length).trim();
  if (!presented) return UNAUTHORIZED();

  const verified = await verifyToken(opts.db, presented);
  if (!verified.ok) return UNAUTHORIZED();

  // Membership must still exist.
  const m = await opts.db.membership.findUnique({
    where: {
      userId_companyId: {
        userId: verified.value.userId,
        companyId: verified.value.companyId,
      },
    },
  });
  if (!m) return UNAUTHORIZED();

  const rl = await checkMcpRateLimit(verified.value.tokenId);
  if (!rl.ok) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(rl.resetIn) },
    });
  }

  // Fire-and-forget. If the DB blip is real the request still proceeds.
  void touchLastUsed(opts.db, verified.value.tokenId).catch(() => {});

  return {
    userId: verified.value.userId,
    companyId: verified.value.companyId,
    tokenId: verified.value.tokenId,
  };
}
