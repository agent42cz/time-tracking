import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { McpAuthContext } from '../authenticate.js';

export interface ToolContext {
  auth: McpAuthContext;
  db: PrismaClient | Prisma.TransactionClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

// Each tool file pushes its registrar onto this array via a side-effect import below.
export const toolRegistrars: ToolRegistrar[] = [];

// Tool files will be added by later tasks. Keep this list — even when empty
// — so the build is stable and the structure is obvious.

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  for (const r of toolRegistrars) r(server, ctx);
}
