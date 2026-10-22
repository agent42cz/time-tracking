import { companyIdInput, resolveCompany } from '../company-scope.js';
import { z } from 'zod';
import { createManualEntry } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z
  .object({
    companyId: companyIdInput,
    startedAt: z
      .string()
      .datetime({ offset: true })
      .describe('ISO 8601 with an offset or `Z`, e.g. `2026-10-22T09:40:00+02:00`.'),
    endedAt: z
      .string()
      .datetime({ offset: true })
      .describe('ISO 8601 with an offset or `Z`. Must be after `startedAt`.'),
    title: z.string().max(5000).optional(),
    description: z.string().max(5000).optional(),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();

const OutputSchema = z.object({ id: z.string() });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'create_entry',
    {
      title: 'Create a completed time entry',
      description:
        'Creates a stopped time entry for a window in the past, e.g. work logged after the fact (US-114). `startedAt` and `endedAt` are ISO 8601 with an offset; the user’s business day is Europe/Prague. `endedAt` must be after `startedAt` and neither may lie in the future. Optional `title` (the entry name), `description` (the longer free-text detail), `clientId`, `projectId`.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      const res = await createManualEntry(
        ctx.db,
        ctx.auth.userId,
        {
          companyId: companyId,
          description: args.title,
          note: args.description,
          clientId: args.clientId,
          projectId: args.projectId,
          startedAt: new Date(args.startedAt),
          endedAt: new Date(args.endedAt),
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
