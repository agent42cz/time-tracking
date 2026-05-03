/**
 * WebSocket server for the time tracker.
 *
 * Authenticates each connection by looking up the session token (provided
 * via cookie or `?token=` query param) in the same Postgres `sessions`
 * table the web app uses. Subscribes the socket to two Redis pub/sub
 * channels: `user:{userId}` and `company:{companyId}` (one per active
 * membership). Events published to those channels by the web app's
 * mutation handlers are forwarded to subscribed sockets in JSON.
 *
 * Cross-company isolation: a socket can only receive `company:{id}` events
 * for companies the authenticated user is a member of. The membership
 * list is captured at connect time; if a user is removed from a company
 * they must reconnect to lose access.
 */
import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Redis } from 'ioredis';
import type { PrismaClient } from '@prisma/client';

export interface AuthInfo {
  userId: string;
  companyIds: string[];
}

export interface BuildOptions {
  prisma: PrismaClient;
  redisUrl: string;
  /** Override the auth resolver for tests (default: cookie/query token via DB). */
  resolveAuth?: (req: IncomingMessage) => Promise<AuthInfo | null>;
}

function defaultResolveAuth(prisma: PrismaClient) {
  return async (req: IncomingMessage): Promise<AuthInfo | null> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token =
      url.searchParams.get('token') ?? readCookie(req.headers.cookie, 'tt-session');
    if (!token) return null;
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const session = await prisma.session.findUnique({ where: { sessionToken: tokenHash } });
    if (!session || session.expires.getTime() <= Date.now()) return null;
    const memberships = await prisma.membership.findMany({
      where: { userId: session.userId },
      select: { companyId: true },
    });
    return {
      userId: session.userId,
      companyIds: memberships.map((m) => m.companyId),
    };
  };
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const [k, v] = pair.trim().split('=');
    if (k === name && v !== undefined) return decodeURIComponent(v);
  }
  return null;
}

interface Client {
  socket: WebSocket;
  userId: string;
  companyIds: string[];
}

export interface BuiltWsServer {
  attach: (httpServer: Server) => void;
  close: () => Promise<void>;
  /** Test-only: number of currently connected clients. */
  clientCount: () => number;
}

export function buildWsServer(opts: BuildOptions): BuiltWsServer {
  const wss = new WebSocketServer({ noServer: true });
  const sub = new Redis(opts.redisUrl);
  const clients = new Set<Client>();
  const resolveAuth = opts.resolveAuth ?? defaultResolveAuth(opts.prisma);

  // Single subscriber forwards all messages; per-connection filtering decides
  // who receives what. This avoids dynamic SUBSCRIBE/UNSUBSCRIBE storms.
  sub.psubscribe('user:*', 'company:*').catch((err: unknown) => {
    process.stderr.write(`ws: psubscribe failed: ${String(err)}\n`);
  });
  sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }
    for (const c of clients) {
      if (c.socket.readyState !== c.socket.OPEN) continue;
      const targetUser = channel.startsWith('user:') ? channel.slice(5) : null;
      const targetCompany = channel.startsWith('company:') ? channel.slice(8) : null;
      const ok =
        (targetUser !== null && targetUser === c.userId) ||
        (targetCompany !== null && c.companyIds.includes(targetCompany));
      if (ok) c.socket.send(JSON.stringify({ channel, ...((payload as object) ?? {}) }));
    }
  });

  function attach(httpServer: Server): void {
    httpServer.on('upgrade', (req, socket, head) => {
      void (async () => {
        const auth = await resolveAuth(req);
        if (!auth) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          const c: Client = {
            socket: ws,
            userId: auth.userId,
            companyIds: auth.companyIds,
          };
          clients.add(c);
          ws.on('close', () => clients.delete(c));
          ws.send(JSON.stringify({ type: 'hello', userId: auth.userId }));
        });
      })();
    });
  }

  async function close(): Promise<void> {
    for (const c of clients) c.socket.terminate();
    clients.clear();
    wss.close();
    sub.disconnect();
  }

  return { attach, close, clientCount: () => clients.size };
}
