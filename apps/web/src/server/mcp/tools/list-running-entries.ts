import { companyIdInput, resolveCompany } from '../company-scope.js';
import { z } from 'zod';
import { listRunningEntries } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z.object({ companyId: companyIdInput }).strict();

const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  startedAt: z.string(),
  clientId: z.string().nullable(),
  projectId: z.string().nullable(),
});

const OutputSchema = z.object({
  entries: z.array(EntrySchema),
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_running_entries',
    {
      title: 'List running time entries',
      description:
        'Lists all currently running time entries (where endedAt is null) for the authenticated user in the selected company (or token default). The user may have multiple concurrent timers (US-21). Timestamps are ISO 8601 in UTC; the user’s business day is Europe/Prague.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      const res = await listRunningEntries(ctx.db, ctx.auth.userId, companyId);
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = {
        entries: res.value.map((e) => ({
          id: e.id,
          title: e.description,
          description: e.note,
          startedAt: e.startedAt.toISOString(),
          clientId: e.clientId,
          projectId: e.projectId,
        })),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
