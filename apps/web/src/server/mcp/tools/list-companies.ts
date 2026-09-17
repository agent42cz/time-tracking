import { z } from 'zod';
import { toolRegistrars } from './registry.js';

toolRegistrars.push((server, ctx) => {
  server.registerTool(
    'list_companies',
    {
      title: 'List available companies',
      description:
        'Lists companies available through this connection and the default company. Pass a returned company ID to other tools; switching is per call and never changes another conversation or the extension. Enable all companies on the existing token in Settings to access your other memberships.',
      inputSchema: {},
      outputSchema: {
        companies: z.array(
          z.object({ id: z.string(), name: z.string(), role: z.string(), isDefault: z.boolean() }),
        ),
      },
    },
    async () => {
      const rows = await ctx.db.membership.findMany({
        where: {
          userId: ctx.auth.userId,
          ...(!ctx.auth.allCompanies ? { companyId: ctx.auth.companyId } : {}),
        },
        include: { company: true },
        orderBy: { company: { name: 'asc' } },
      });
      const payload = {
        companies: rows.map((m) => ({
          id: m.companyId,
          name: m.company.name,
          role: m.role,
          isDefault: m.companyId === ctx.auth.companyId,
        })),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
