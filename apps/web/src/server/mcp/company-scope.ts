import { z } from 'zod';
import type { ToolContext } from './tools/registry.js';

export const companyIdInput = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Company ID from list_companies. Omit to use the token default. Requires a token enabled for all your companies to select another company.',
  );

export async function resolveCompany(ctx: ToolContext, requested?: string): Promise<string | null> {
  const companyId = requested ?? ctx.auth.companyId;
  if (!ctx.auth.allCompanies && companyId !== ctx.auth.companyId) return null;
  const member = await ctx.db.membership.findUnique({
    where: { userId_companyId: { userId: ctx.auth.userId, companyId } },
  });
  return member ? companyId : null;
}

export async function canAccessEntry(
  ctx: ToolContext,
  entryId: string,
  requested?: string,
): Promise<boolean> {
  const entry = await ctx.db.timeEntry.findFirst({
    where: { id: entryId, userId: ctx.auth.userId, deletedAt: null },
    select: { companyId: true },
  });
  if (!entry || (requested !== undefined && requested !== entry.companyId)) return false;
  return (await resolveCompany(ctx, entry.companyId)) !== null;
}
