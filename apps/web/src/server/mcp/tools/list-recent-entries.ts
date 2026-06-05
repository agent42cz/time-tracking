import { z } from 'zod';
import { listRecentEntries } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

/** Per-row cap so a single huge title/description can't bloat the tool response. */
const truncate = (s: string): string => (s.length > 500 ? s.slice(0, 500) : s);

const InputSchema = z.object({ limit: z.number().int().min(1).optional() }).strict();
const OutputSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      clientId: z.string().nullable(),
      projectId: z.string().nullable(),
      tagIds: z.array(z.string()),
    }),
  ),
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_recent_entries',
    {
      title: 'List recent time entries',
      description:
        'Lists the most-recent time entries (running or stopped) for the authenticated user in their token-scoped company, newest first. `limit` defaults to 10, capped at 50. `title` and `description` are each truncated to 500 chars per row.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const limit = Math.min(50, args.limit ?? 10);
      const res = await listRecentEntries(ctx.db, ctx.auth.userId, ctx.auth.companyId, limit);
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = {
        entries: res.value.map((e) => ({
          id: e.id,
          title: truncate(e.description),
          description: truncate(e.note),
          startedAt: e.startedAt.toISOString(),
          endedAt: e.endedAt?.toISOString() ?? null,
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
