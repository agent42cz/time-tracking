import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/session.js';
import type { McpAuthContext } from './authenticate.js';
import { registerAllTools } from './tools/index.js';

export interface BuildMcpInput {
  auth: McpAuthContext;
  db?: PrismaClient | Prisma.TransactionClient;
}

export function buildMcpServer(input: BuildMcpInput): McpServer {
  const server = new McpServer(
    { name: 'time-tracking', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerAllTools(server, { auth: input.auth, db: input.db ?? prisma() });
  return server;
}
