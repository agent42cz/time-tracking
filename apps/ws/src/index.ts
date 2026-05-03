/**
 * Process entry point for the standalone WS service. The web app
 * imports `buildWsServer` directly when running tests; production runs
 * this file behind Coolify's Traefik with TLS termination at the edge.
 */
import { createServer } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { buildWsServer } from './server.js';

const PORT = Number(process.env.WS_PORT ?? 3001);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const prisma = new PrismaClient();
const ws = buildWsServer({ prisma, redisUrl: REDIS_URL });
const http = createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
});
ws.attach(http);

http.listen(PORT, () => {
  process.stdout.write(`ws listening on :${PORT}\n`);
});

const shutdown = async (): Promise<void> => {
  await ws.close();
  await prisma.$disconnect();
  http.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
