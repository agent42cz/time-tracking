import { z } from 'zod';
import { companyIdInput, resolveCompany } from '../company-scope.js';
import { listEntries, type EntryListAfter } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { dayInput, parseDayRange } from '../period.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const InputSchema = z
  .object({
    companyId: companyIdInput,
    from: dayInput.optional().describe('First included day, `YYYY-MM-DD` in Europe/Prague.'),
    to: dayInput.optional().describe('Last included day, `YYYY-MM-DD` in Europe/Prague.'),
    clientId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Case-insensitive substring of the title or description.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .describe(`Page size, default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`),
    cursor: z
      .string()
      .min(1)
      .optional()
      .describe('`nextCursor` from the previous page. Keep the other filters unchanged.'),
  })
  .strict();

const OutputSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      running: z.boolean(),
      durationMinutes: z.number(),
      clientId: z.string().nullable(),
      projectId: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

// Opaque to clients: base64url of [startedAt ISO, id] of the page's last row.
function encodeCursor(after: EntryListAfter): string {
  return Buffer.from(JSON.stringify([after.startedAt.toISOString(), after.id])).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): EntryListAfter | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(v) || typeof v[0] !== 'string' || typeof v[1] !== 'string') return null;
    const startedAt = new Date(v[0]);
    return Number.isNaN(startedAt.getTime()) ? null : { startedAt, id: v[1] };
  } catch {
    return null;
  }
}

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_entries',
    {
      title: 'List time entries',
      description:
        'Lists the authenticated user’s own time entries (running or stopped) in the selected company (or token default), oldest first, with full title and description. Filter by `from`/`to` (inclusive `YYYY-MM-DD` days in Europe/Prague, matched on the start time like the tracker report), `clientId`, `projectId` and `query`. Paginated: pass the returned `nextCursor` as `cursor` until it is null. Each row carries `durationMinutes` (running entries count up to now) and `running`. For totals use `summarize_entries` instead of paging through everything.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      const range = parseDayRange(args.from, args.to);
      if (!range) return toolError('invalid_args', '`to` is before `from`.');
      const after = args.cursor === undefined ? undefined : decodeCursor(args.cursor);
      if (after === null) return toolError('invalid_args', 'Invalid cursor.');

      const limit = args.limit ?? DEFAULT_LIMIT;
      const res = await listEntries(
        ctx.db,
        ctx.auth.userId,
        companyId,
        {
          ...range,
          clientId: args.clientId,
          projectId: args.projectId,
          query: args.query,
        },
        { limit, after },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const now = Date.now();
      const { rows, hasMore } = res.value;
      const last = rows[rows.length - 1];
      const payload = {
        entries: rows.map((e) => ({
          id: e.id,
          title: e.description,
          description: e.note,
          startedAt: e.startedAt.toISOString(),
          endedAt: e.endedAt?.toISOString() ?? null,
          running: e.endedAt === null,
          durationMinutes:
            Math.round(((e.endedAt?.getTime() ?? now) - e.startedAt.getTime()) / 600) / 100,
          clientId: e.clientId,
          projectId: e.projectId,
        })),
        nextCursor: hasMore && last ? encodeCursor(last) : null,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
