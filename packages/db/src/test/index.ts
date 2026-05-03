/**
 * Test harness for integration tests.
 *
 * - `getTestPrisma()` — booted once per process via testcontainers (Postgres 16),
 *   schema applied via `prisma db push`. Reused across files.
 * - `withTx(fn)` — runs `fn` inside a Prisma interactive transaction that is
 *   always rolled back. Each test gets its own transaction; zero shared state.
 *
 * Per BUILD-PROMPT: never mock the DB. All integration tests use these.
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '..', '..', 'prisma', 'schema.prisma');

let _container: StartedPostgreSqlContainer | undefined;
let _prisma: PrismaClient | undefined;
let _bootPromise: Promise<PrismaClient> | undefined;

async function boot(): Promise<PrismaClient> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('timetracker_test')
    .withUsername('timetracker')
    .withPassword('timetracker')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  execSync(`pnpm prisma db push --schema "${SCHEMA_PATH}" --skip-generate --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  _container = container;
  const client = new PrismaClient({ datasources: { db: { url } } });
  await client.$connect();
  _prisma = client;
  return client;
}

export function getTestPrisma(): Promise<PrismaClient> {
  if (_prisma) return Promise.resolve(_prisma);
  _bootPromise ??= boot();
  return _bootPromise;
}

export async function stopTestPrisma(): Promise<void> {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = undefined;
  }
  if (_container) {
    await _container.stop();
    _container = undefined;
  }
  _bootPromise = undefined;
}

export type TxClient = Prisma.TransactionClient;

const ROLLBACK = Symbol('test-rollback');

/**
 * Run `fn` inside a Prisma interactive transaction that is ALWAYS rolled back.
 * Returns the value `fn` returned (or rethrows the error `fn` threw).
 */
export async function withTx<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  const prisma = await getTestPrisma();
  let captured: { ok: true; value: T } | { ok: false; err: unknown } | undefined;

  try {
    await prisma.$transaction(
      async (tx) => {
        try {
          captured = { ok: true, value: await fn(tx) };
        } catch (err) {
          captured = { ok: false, err };
        }
        throw ROLLBACK;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  if (!captured) throw new Error('withTx: callback did not run');
  if (captured.ok) return captured.value;
  throw captured.err;
}

/** Wipe every app table. Prefer withTx in tests. */
export async function resetDb(prisma?: PrismaClient): Promise<void> {
  const p = prisma ?? (await getTestPrisma());
  await p.timeEntryTag.deleteMany();
  await p.timeEntry.deleteMany();
  await p.tag.deleteMany();
  await p.project.deleteMany();
  await p.client.deleteMany();
  await p.invite.deleteMany();
  await p.auditLog.deleteMany();
  await p.totpRecoveryCode.deleteMany();
  await p.passwordLoginAttempt.deleteMany();
  await p.magicLink.deleteMany();
  await p.session.deleteMany();
  await p.account.deleteMany();
  await p.verificationToken.deleteMany();
  await p.membership.deleteMany();
  await p.company.deleteMany();
  await p.user.deleteMany();
}
