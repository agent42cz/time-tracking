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
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = join(__dirname, '..', '..', 'prisma', 'schema.prisma');

let _container: StartedPostgreSqlContainer | undefined;
let _prisma: PrismaClient | undefined;
let _bootPromise: Promise<PrismaClient> | undefined;

/** Resolve once whether a host:port accepts a TCP connection. */
function tcpReachable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/**
 * Build a client-reachable connection URL to the started Postgres container.
 *
 * Normally testcontainers exposes the DB on the host via a mapped port
 * (`getHost():getMappedPort()`) — this is what CI (daemon on the same host as
 * the test runner) uses. In a sibling-container sandbox the runner talks to the
 * daemon over a shared socket, so mapped/published ports are not routable and
 * only the container's own bridge IP + internal port is reachable. Probe the
 * mapped host first and fall back to the bridge IP only when it is unreachable,
 * so CI behaviour is unchanged.
 */
async function reachableConnectionUri(container: StartedPostgreSqlContainer): Promise<string> {
  const mappedHost = container.getHost();
  const mappedPort = container.getMappedPort(5432);
  if (await tcpReachable(mappedHost, mappedPort)) return container.getConnectionUri();
  const bridgeIp = container.getIpAddress('bridge');
  return `postgresql://timetracker:timetracker@${bridgeIp}:5432/timetracker_test`;
}

async function boot(): Promise<PrismaClient> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('timetracker_test')
    .withUsername('timetracker')
    .withPassword('timetracker')
    // Default strategy includes Wait.forListeningPorts(), which probes the
    // mapped port from the client side. In a sibling-container sandbox that
    // port is not routable and the wait hangs; the in-container pg_isready
    // health check is a reliable readiness signal in CI and sandbox alike.
    .withWaitStrategy(Wait.forHealthCheck())
    .start();

  const url = await reachableConnectionUri(container);
  process.env.DATABASE_URL = url;

  // Filter via @tt/db so the prisma binary is resolved against the
  // workspace that actually depends on it. Calling bare `pnpm prisma`
  // from apps/web's vitest cwd fails because the CLI isn't hoisted into
  // every package's local node_modules/.bin.
  execSync(
    `pnpm --filter @tt/db exec prisma db push --schema "${SCHEMA_PATH}" --skip-generate --accept-data-loss`,
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    },
  );

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
