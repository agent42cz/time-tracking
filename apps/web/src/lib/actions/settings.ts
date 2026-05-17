'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, prisma } from '../session.js';

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; error: 'unauthorized' | 'invalid_input' };

export async function setAutoStackOverlapsAction(value: boolean): Promise<SettingsActionResult> {
  if (typeof value !== 'boolean') {
    return { ok: false, error: 'invalid_input' };
  }
  const session = await requireUser();
  await prisma().user.update({
    where: { id: session.userId },
    data: { autoStackOverlaps: value },
  });
  revalidatePath('/settings');
  return { ok: true };
}
