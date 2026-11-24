import { z } from 'zod';
import { companyIdInput, resolveCompany } from '../company-scope.js';
import { summarizeEntries } from '../../../lib/services/reports.js';
import { mapServiceReason, toolError } from '../errors.js';
import { dayInput, parseDayRange } from '../period.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z
  .object({
    companyId: companyIdInput,
    from: dayInput.describe('First included day, `YYYY-MM-DD` in Europe/Prague.'),
    to: dayInput.describe('Last included day, `YYYY-MM-DD` in Europe/Prague.'),
    groupBy: z
      .enum(['client', 'project', 'day', 'member'])
      .optional()
      .describe('Default `project`.'),
    clientId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    memberIds: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .optional()
      .describe(
        'User IDs from `list_members`; default yourself. Colleagues only for company admins, like the tracker report.',
      ),
    allMembers: z
      .boolean()
      .optional()
      .describe(
        'Company admins only: everyone’s entries, including former members, like the unfiltered tracker report. Not combinable with `memberIds`.',
      ),
  })
  .strict();

const OutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(['client', 'project', 'day', 'member']),
  totalMinutes: z.number(),
  totalHours: z.number(),
  entryCount: z.number(),
  groups: z.array(
    z.object({
      clientId: z.string().nullable(),
      clientName: z.string().nullable(),
      projectId: z.string().nullable(),
      projectName: z.string().nullable(),
      day: z.string().nullable(),
      userId: z.string().nullable(),
      userName: z.string().nullable(),
      minutes: z.number(),
      entryCount: z.number(),
    }),
  ),
});

const minutes = (ms: number): number => Math.round(ms / 600) / 100;

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'summarize_entries',
    {
      title: 'Summarize time entries',
      description:
        'Totals time between `from` and `to` (inclusive `YYYY-MM-DD` days in Europe/Prague) of the authenticated user, or for company admins of `memberIds` or `allMembers`, grouped by `client`, `project` (default), `day` or `member`. Optional `clientId`/`projectId` narrow it. Totals equal the tracker report for the same filters: entries count by start day, time past `to` and running timers are clipped at the end of the range. Minutes are exact (2 decimals); the report UI floors to whole minutes.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      const range = parseDayRange(args.from, args.to);
      if (!range?.from || !range.to) return toolError('invalid_args', '`to` is before `from`.');
      if (args.allMembers && args.memberIds)
        return toolError('invalid_args', 'Use either `memberIds` or `allMembers`.');
      const groupBy = args.groupBy ?? 'project';

      const res = await summarizeEntries(
        ctx.db,
        ctx.auth.userId,
        {
          companyId,
          from: range.from,
          to: range.to,
          clientIds: args.clientId ? [args.clientId] : undefined,
          projectIds: args.projectId ? [args.projectId] : undefined,
          memberIds: args.memberIds,
          allMembers: args.allMembers,
        },
        groupBy,
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const totalMinutes = minutes(res.value.totalMs);
      const payload = {
        from: args.from,
        to: args.to,
        groupBy,
        totalMinutes,
        totalHours: Math.round(totalMinutes / 0.6) / 100,
        entryCount: res.value.entryCount,
        groups: res.value.groups.map(({ totalMs, ...g }) => ({ ...g, minutes: minutes(totalMs) })),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
