'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, prisma } from '../session.js';

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function setAutoStackOverlapsAction(value: boolean): Promise<SettingsActionResult> {
  const session = await requireUser();
  await prisma().user.update({
    where: { id: session.userId },
    data: { autoStackOverlaps: value },
  });
  revalidatePath('/settings');
  return { ok: true };
}
