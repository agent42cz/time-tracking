'use server';

import { revalidatePath } from 'next/cache';
import { prisma, requireUser } from '../session.js';
import { issueToken, revokeToken } from '../services/api-tokens.js';

export async function issueTokenAction(input: {
  companyId: string;
  name: string;
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
