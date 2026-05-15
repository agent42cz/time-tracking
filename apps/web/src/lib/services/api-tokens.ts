/**
 * Personal API tokens for the MCP server. Argon2id-hashed at rest;
 * plaintext is returned exactly once at issue time. Tokens are scoped
 * to a (user, company) pair — the MCP request inherits both from the
 * token, never trusts client-supplied identifiers.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { writeAudit } from './audit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

const TOKEN_PREFIX = 'tt_pat_';
const SECRET_LEN = 24;
const PREFIX_LEN = TOKEN_PREFIX.length + 7; // "tt_pat_" + first 7 chars of the secret

// RFC 4648 base32 alphabet, lowercase, no padding.
const ALPHA = 'abcdefghijklmnopqrstuvwxyz234567';

function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i]! % 32];
  return out;
}

export interface IssueInput {
  companyId: string;
  name: string;
}

export async function issueToken(
  db: Db,
  actorUserId: string,
  input: IssueInput,
): Promise<Result<{ id: string; plaintext: string }>> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId: input.companyId } },
  });
  if (!m) return { ok: false, reason: 'not_found' };
  const trimmed = input.name.trim();
  if (!trimmed || trimmed.length > 100) return { ok: false, reason: 'not_found' };

  const plaintext = TOKEN_PREFIX + randomBase32(SECRET_LEN);
  const prefix = plaintext.slice(0, PREFIX_LEN);
  const tokenHash = await hashPassword(plaintext);

  const created = await db.apiToken.create({
    data: {
      userId: actorUserId,
      companyId: input.companyId,
      name: trimmed,
      tokenHash,
      prefix,
    },
  });
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'ApiToken',
    entityId: created.id,
    after: { name: trimmed, prefix },
  });
  return { ok: true, value: { id: created.id, plaintext } };
}

export async function verifyToken(
  db: Db,
  presented: string,
): Promise<Result<{ tokenId: string; userId: string; companyId: string }>> {
  if (!presented.startsWith(TOKEN_PREFIX)) return { ok: false, reason: 'not_found' };
  const prefix = presented.slice(0, PREFIX_LEN);
  const candidates = await db.apiToken.findMany({
    where: { prefix, revokedAt: null },
    take: 5,
  });
  for (const c of candidates) {
    if (await verifyPassword(c.tokenHash, presented)) {
      return {
        ok: true,
        value: { tokenId: c.id, userId: c.userId, companyId: c.companyId },
      };
    }
  }
  return { ok: false, reason: 'not_found' };
}

export async function revokeToken(
  db: Db,
  actorUserId: string,
  tokenId: string,
): Promise<Result<true>> {
  const t = await db.apiToken.findUnique({ where: { id: tokenId } });
  if (!t || t.userId !== actorUserId) return { ok: false, reason: 'not_found' };
  if (t.revokedAt) return { ok: true, value: true };
  await db.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
  await writeAudit(db, {
    companyId: t.companyId,
    actorUserId,
    action: 'update',
    entityType: 'ApiToken',
    entityId: tokenId,
    after: { revokedAt: new Date().toISOString() },
  });
  return { ok: true, value: true };
}

export async function listTokens(
  db: Db,
  actorUserId: string,
): Promise<
  Array<{
    id: string;
    companyId: string;
    name: string;
    prefix: string;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>
> {
  const rows = await db.apiToken.findMany({
    where: { userId: actorUserId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      companyId: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function touchLastUsed(db: Db, tokenId: string): Promise<void> {
  await db.apiToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } });
}
