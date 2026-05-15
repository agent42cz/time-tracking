import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateRequest } from '../../../server/mcp/authenticate.js';
import { buildMcpServer } from '../../../server/mcp/router.js';
import { prisma } from '../../../lib/session.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req, { db: prisma() });
  if (auth instanceof Response) return auth;

  const server = buildMcpServer({ auth });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
