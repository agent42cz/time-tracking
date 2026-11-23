import { z } from 'zod';
import { companyIdInput, resolveCompany } from '../company-scope.js';
import { createClient, createProject } from '../../../lib/services/catalog.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './registry.js';

const nameInput = z.string().trim().min(1).max(200);
const ClientInput = z.object({ companyId: companyIdInput, name: nameInput }).strict();
const ProjectInput = z
  .object({ companyId: companyIdInput, clientId: z.string().min(1), name: nameInput })
  .strict();
const OutputSchema = z.object({ id: z.string() });

const ok = (id: string) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ id }) }],
  structuredContent: { id },
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'create_client',
    {
      title: 'Create a client',
      description:
        'Creates a client in the selected company (or token default). Company admins only; anyone else gets `not_found`.',
      inputSchema: ClientInput.shape,
      outputSchema: OutputSchema.shape,
      annotations: { idempotentHint: false },
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      // Names are unique per company; answer conflict instead of a raw Prisma P2002.
      if (
        await ctx.db.client.findFirst({
          where: { companyId, name: args.name },
          select: { id: true },
        })
      )
        return toolError('conflict', 'A client with this name already exists.');
      const res = await createClient(
        ctx.db,
        ctx.auth.userId,
        { companyId, name: args.name },
        { source: 'mcp' },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      return ok(res.value.id);
    },
  );

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description:
        'Creates a project under `clientId` (from `list_catalog`) in the selected company (or token default). Company admins only; anyone else gets `not_found`.',
      inputSchema: ProjectInput.shape,
      outputSchema: OutputSchema.shape,
      annotations: { idempotentHint: false },
    },
    async (args) => {
      const companyId = await resolveCompany(ctx, args.companyId);
      if (!companyId) return toolError('not_found', 'Not found');
      // createProject trusts the client's company; the token may not cover it.
      const client = await ctx.db.client.findFirst({
        where: { id: args.clientId, companyId },
        select: { id: true },
      });
      if (!client) return toolError('not_found', 'Not found');
      if (
        await ctx.db.project.findFirst({
          where: { clientId: client.id, name: args.name },
          select: { id: true },
        })
      )
        return toolError('conflict', 'A project with this name already exists for this client.');
      const res = await createProject(
        ctx.db,
        ctx.auth.userId,
        { clientId: client.id, name: args.name },
        { source: 'mcp' },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      return ok(res.value.id);
    },
  );
});
