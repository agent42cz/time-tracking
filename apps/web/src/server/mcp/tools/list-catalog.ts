import { z } from 'zod';
import { listClients, listProjects } from '../../../lib/services/catalog.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const KindSchema = z.enum(['clients', 'projects']);
const InputSchema = z
  .object({
    kind: KindSchema,
    query: z.string().max(200).optional(),
  })
  .strict();

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean().optional(),
  clientId: z.string().optional(),
});

const OutputSchema = z.object({ items: z.array(ItemSchema) });

function matchesQuery(name: string, q: string | undefined): boolean {
  if (!q) return true;
  const lower = name.toLocaleLowerCase('cs-CZ');
  return lower.includes(q.toLocaleLowerCase('cs-CZ'));
}

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_catalog',
    {
      title: 'List catalog (clients / projects)',
      description:
        'Lists company-level catalog entities the user can pick from. `kind` is one of `clients`, `projects`. Optional `query` filters by substring (Czech locale).',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      if (args.kind === 'clients') {
        const res = await listClients(ctx.db, ctx.auth.userId, ctx.auth.companyId);
        if (!res.ok) {
          const { code, message } = mapServiceReason(res.reason);
          return toolError(code, message);
        }
        const items = res.value
          .filter((c) => matchesQuery(c.name, args.query))
          .map((c) => ({ id: c.id, name: c.name, archived: c.archived }));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ items }) }],
          structuredContent: { items },
        };
      }
      const res = await listProjects(ctx.db, ctx.auth.userId, ctx.auth.companyId, {});
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const items = res.value
        .filter((p) => matchesQuery(p.name, args.query))
        .map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, archived: p.archived }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ items }) }],
        structuredContent: { items },
      };
    },
  );
});
