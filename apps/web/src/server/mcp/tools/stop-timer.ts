import { z } from 'zod';
import { stopTimer } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z.object({ entryId: z.string().min(1) }).strict();
const OutputSchema = z.object({ ok: z.literal(true) });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'stop_timer',
    {
      title: 'Stop a timer',
      description:
        'Ends the running time entry identified by `entryId`. Other running entries are left alone (US-21). Returns `conflict` if the entry is already stopped.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await stopTimer(ctx.db, ctx.auth.userId, args.entryId, undefined, {
        source: 'mcp',
      });
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
