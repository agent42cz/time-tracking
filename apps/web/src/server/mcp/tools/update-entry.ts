import { z } from 'zod';
import { updateEntry } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z
  .object({
    entryId: z.string().min(1),
    description: z.string().max(5000).optional(),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    tagIds: z.array(z.string()).max(20).optional(),
  })
  .strict();

const OutputSchema = z.object({ ok: z.literal(true) });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'update_entry',
    {
      title: 'Update a time entry',
      description:
        'Updates fields on a specific time entry identified by `entryId`. Pass `null` for `clientId`/`projectId` to clear the link. `tagIds` replaces the full tag set.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await updateEntry(
        ctx.db,
        ctx.auth.userId,
        args.entryId,
        {
          description: args.description,
          clientId: args.clientId,
          projectId: args.projectId,
          tagIds: args.tagIds,
        },
        undefined,
        { source: 'mcp' },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = { ok: true as const };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
