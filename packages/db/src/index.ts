/**
 * Prisma client + a typed re-export of generated enums.
 * The schema is in `prisma/schema.prisma`. Run `pnpm prisma:generate` first.
 */
import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return _client;
}

export { PrismaClient };
export type { Prisma } from '@prisma/client';
