import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { McpAuthContext } from '../authenticate.js';

export interface ToolContext {
  auth: McpAuthContext;
  db: PrismaClient | Prisma.TransactionClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

/**
 * Shared registry array. Both `index.ts` (which iterates it) and individual
 * tool files (which push onto it) import from here, avoiding circular
 * initialization issues.
 */
export const toolRegistrars: ToolRegistrar[] = [];
