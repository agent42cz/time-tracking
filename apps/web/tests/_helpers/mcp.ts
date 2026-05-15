import type { Prisma } from '@prisma/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../../src/server/mcp/router.js';
import type { McpAuthContext } from '../../src/server/mcp/authenticate.js';

export interface InProcessMcp {
  client: Client;
  close: () => Promise<void>;
}

/**
 * Build a real McpServer bound to the given (userId, companyId) and connect
 * it to an in-process Client via an InMemoryTransport pair. The tool
 * handlers run with `db` (typically a test tx).
 */
export async function buildInProcessMcp(args: {
  db: Prisma.TransactionClient;
  userId: string;
  companyId: string;
}): Promise<InProcessMcp> {
  const auth: McpAuthContext = {
    userId: args.userId,
    companyId: args.companyId,
    tokenId: 'test-token',
  };
  const server = buildMcpServer({ auth, db: args.db });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tt-test', version: '0.0.0' }, { capabilities: {} });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
