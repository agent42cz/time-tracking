import { z } from 'zod';
import { companyIdInput, canAccessEntry } from '../company-scope.js';
import { softDeleteEntry } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z.object({ companyId: companyIdInput, entryId: z.string().min(1) }).strict();
const OutputSchema = z.object({ ok: z.literal(true) });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'delete_entry',
    {
      title: 'Delete a time entry',
      description:
        'Moves the authenticated user’s own time entry `entryId` to the trash. It can be restored in the tracker for 30 days, then it is purged.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async (args) => {
      if (!(await canAccessEntry(ctx, args.entryId, args.companyId)))
        return toolError('not_found', 'Not found');
      const res = await softDeleteEntry(ctx.db, ctx.auth.userId, args.entryId, undefined, {
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
