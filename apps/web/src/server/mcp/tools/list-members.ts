import { z } from 'zod';
import { companyIdInput, resolveCompany } from '../company-scope.js';
import { toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const InputSchema = z.object({ companyId: companyIdInput }).strict();

const OutputSchema = z.object({
  members: z.array(
    z.object({ userId: z.string(), name: z.string(), role: z.enum(['admin', 'user']) }),
  ),
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_members',
    {
      title: 'List company members',
      description:
        'Lists the members of the selected company (or token default) whose entries you may read, sorted by name: everyone for a company admin, only yourself otherwise (same as the tracker report). Use a `userId` as `memberId` in `list_entries` or in `memberIds` of `summarize_entries`.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      const me = await ctx.db.membership.findUnique({
        where: { userId_companyId: { userId: ctx.auth.userId, companyId } },
      });
      if (!me) return toolError('not_found', 'Not found');
      const rows = await ctx.db.membership.findMany({
        where: { companyId, ...(me.role === 'admin' ? {} : { userId: ctx.auth.userId }) },
        include: { user: true },
        orderBy: { user: { fullName: 'asc' } },
      });
      const payload = {
        members: rows.map((m) => ({ userId: m.userId, name: m.user.fullName, role: m.role })),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
