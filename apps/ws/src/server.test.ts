/**
 * Phase 7 — WS sync tests.
 * Covers US-31.
 *
 * Boots: Postgres (testcontainers, via @tt/db harness) + Redis (testcontainers).
 * Two clients of the same user must receive each other's events within 1s.
 * Cross-company: a client of company A receives ZERO events when company B
 * publishes over a 3-second window.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import WebSocket from 'ws';
import { getTestPrisma, stopTestPrisma } from '@tt/db/test';
import { buildWsServer } from './server.js';
import { publishEvent } from './publish.js';

let redis: StartedTestContainer;
let redisUrl: string;
let httpServer: Server;
let ws: ReturnType<typeof buildWsServer>;
let port: number;

async function pickPort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, () => {
      const addr = s.address();
      const p = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(p));
    });
  });
}

beforeAll(async () => {
  redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  const prisma = await getTestPrisma();

  ws = buildWsServer({
    prisma,
    redisUrl,
    // Auth shim for tests: token format `userId:companyId,companyId,...`.
    resolveAuth: async (req) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const t = url.searchParams.get('token');
      if (!t) return null;
      const [userId, companies] = t.split(':');
      return {
        userId: userId ?? '',
        companyIds: companies ? companies.split(',') : [],
      };
    },
  });
  port = await pickPort();
  httpServer = createServer();
  ws.attach(httpServer);
  await new Promise<void>((res) => httpServer.listen(port, res));
}, 180_000);

afterAll(async () => {
  await new Promise<void>((res) => httpServer.close(() => res()));
  await ws.close();
  await redis.stop();
  await stopTestPrisma();
}, 30_000);

interface OpenClient {
  ws: WebSocket;
  messages: unknown[];
  close: () => void;
}

async function open(token: string): Promise<OpenClient> {
  const sock = new WebSocket(`ws://localhost:${port}/?token=${encodeURIComponent(token)}`);
  const messages: unknown[] = [];
  sock.on('message', (raw: WebSocket.RawData) => {
    try {
      messages.push(JSON.parse(raw.toString()));
    } catch {
      // ignore non-JSON
    }
  });
  await new Promise<void>((res, rej) => {
    sock.once('open', () => res());
    sock.once('error', rej);
  });
  // Eat the hello frame.
  await new Promise<void>((r) => setTimeout(r, 50));
  return {
    ws: sock,
    messages,
    close: () => sock.close(),
  };
}

async function waitFor<T>(fn: () => T | undefined, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('ws sync', () => {
  it('US-31: two sockets of the same user receive each others events within 1s', async () => {
    const a = await open(`u-1:co-1`);
    const b = await open(`u-1:co-1`);
    try {
      await publishEvent(redisUrl, {
        channel: 'user:u-1',
        type: 'time_entry.created',
        payload: { id: 'e-123' },
        emittedAt: new Date().toISOString(),
      });
      // Both should receive within 1 second.
      const aGot = await waitFor(
        () =>
          a.messages.find((m) => (m as { type?: string }).type === 'time_entry.created') as
            | { type: string }
            | undefined,
        1000,
      );
      const bGot = await waitFor(
        () =>
          b.messages.find((m) => (m as { type?: string }).type === 'time_entry.created') as
            | { type: string }
            | undefined,
        1000,
      );
      expect(aGot.type).toBe('time_entry.created');
      expect(bGot.type).toBe('time_entry.created');
    } finally {
      a.close();
      b.close();
    }
  });

  it('US-31: cross-company sockets never receive the others events (3s window)', async () => {
    const a = await open(`u-A:co-A`);
    const b = await open(`u-B:co-B`);
    try {
      await publishEvent(redisUrl, {
        channel: 'company:co-A',
        type: 'time_entry.created',
        payload: { id: 'e-A1' },
        emittedAt: new Date().toISOString(),
      });
      // Wait the full 3s without seeing anything on B.
      await new Promise((r) => setTimeout(r, 3000));
      const leak = b.messages.find((m) => (m as { type?: string }).type === 'time_entry.created');
      expect(leak).toBeUndefined();
      // Sanity: A did receive it.
      const got = a.messages.find((m) => (m as { type?: string }).type === 'time_entry.created');
      expect(got).toBeDefined();
    } finally {
      a.close();
      b.close();
    }
  }, 10_000);
});
