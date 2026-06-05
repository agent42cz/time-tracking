import { z } from 'zod';
import { startTimer } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z
  .object({
    title: z.string().max(2000).optional(),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    tagIds: z.array(z.string()).max(20).optional(),
  })
  .strict();

const OutputSchema = z.object({ id: z.string() });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'start_timer',
    {
      title: 'Start a timer',
      description:
        'Starts a new running time entry. Other already-running timers (US-21) are left alone. Optional `title` (the entry name), `clientId`, `projectId`, `tagIds`. Use `update_entry` afterwards to set the longer `description`.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await startTimer(
        ctx.db,
        ctx.auth.userId,
        {
          companyId: ctx.auth.companyId,
          description: args.title,
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
      const payload = { id: res.value.id };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
