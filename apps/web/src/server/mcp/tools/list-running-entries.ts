import { z } from 'zod';
import { listRunningEntries } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z.object({}).strict();

const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  startedAt: z.string(),
  clientId: z.string().nullable(),
  projectId: z.string().nullable(),
  tagIds: z.array(z.string()),
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
        'Lists all currently running time entries (where endedAt is null) for the authenticated user in their token-scoped company. The user may have multiple concurrent timers (US-21). Timestamps are ISO 8601 in UTC; the user’s business day is Europe/Prague.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (_args) => {
      const res = await listRunningEntries(ctx.db, ctx.auth.userId, ctx.auth.companyId);
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
          tagIds: e.tagIds,
        })),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
