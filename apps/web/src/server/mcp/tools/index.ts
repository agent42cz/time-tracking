import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolRegistrars } from './registry.js';
import type { ToolContext } from './registry.js';

// Re-export so callers use a single import path.
export type { ToolContext, ToolRegistrar } from './registry.js';
export { toolRegistrars } from './registry.js';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  for (const r of toolRegistrars) r(server, ctx);
}

// Side-effect imports: each module pushes its registrar onto toolRegistrars.
// registry.ts has no imports from index.ts so there is no circular reference.
import './list-running-entries.js';
import './list-recent-entries.js';
