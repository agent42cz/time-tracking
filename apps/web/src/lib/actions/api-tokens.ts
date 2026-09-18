'use server';

import { revalidatePath } from 'next/cache';
import { prisma, requireUser } from '../session.js';
import { issueToken, revokeToken, setTokenCompanyScope } from '../services/api-tokens.js';

export async function issueTokenAction(input: {
  companyId: string;
  name: string;
  allCompanies?: boolean;
}): Promise<{ plaintext: string }> {
  const session = await requireUser();
  const res = await issueToken(prisma(), session.userId, input);
  if (!res.ok) throw new Error('Cannot issue token.');
  revalidatePath('/settings/api-tokens');
  return { plaintext: res.value.plaintext };
}

export async function revokeTokenAction(input: { tokenId: string }): Promise<void> {
  const session = await requireUser();
  const res = await revokeToken(prisma(), session.userId, input.tokenId);
  if (!res.ok) throw new Error('Cannot revoke token.');
  revalidatePath('/settings/api-tokens');
}

export async function setTokenCompanyScopeAction(
  tokenId: string,
  allCompanies: boolean,
): Promise<void> {
  const session = await requireUser();
  if (typeof allCompanies !== 'boolean') throw new Error('Invalid scope');
  const result = await setTokenCompanyScope(prisma(), session.userId, tokenId, allCompanies);
  if (!result.ok) throw new Error('Cannot update token');
  revalidatePath('/settings/api-tokens');
}
