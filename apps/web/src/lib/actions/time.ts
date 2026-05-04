'use server';

import { revalidatePath } from 'next/cache';
import { requireActiveCompany, prisma } from '../session.js';
import {
  createManualEntry,
  restoreEntry,
  softDeleteEntry,
  startTimer,
  stopTimer,
  updateEntry,
} from '../services/time-entries.js';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function startTimerAction(formData: FormData): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await startTimer(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    description: String(formData.get('description') ?? ''),
    clientId: (formData.get('clientId') as string) || null,
    projectId: (formData.get('projectId') as string) || null,
    tagIds: formData.getAll('tagIds').map(String).filter(Boolean),
  });
  if (!result.ok) return { ok: false, error: 'Nepodařilo se spustit měření' };
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function stopTimerAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await stopTimer(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Měření nelze zastavit' };
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function createManualAction(formData: FormData): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const date = String(formData.get('date') ?? '');
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  if (!date || !from || !to) return { ok: false, error: 'Vyplňte datum a čas' };
  const startedAt = new Date(`${date}T${from}:00`);
  const endedAt = new Date(`${date}T${to}:00`);
  const result = await createManualEntry(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    description: String(formData.get('description') ?? ''),
    clientId: (formData.get('clientId') as string) || null,
    projectId: (formData.get('projectId') as string) || null,
    tagIds: formData.getAll('tagIds').map(String).filter(Boolean),
    startedAt,
    endedAt,
  });
  if (!result.ok) {
    if (result.reason === 'invalid_window')
      return { ok: false, error: 'Konec musí být po začátku' };
    if (result.reason === 'future_timestamp')
      return { ok: false, error: 'Nelze zadat budoucí čas' };
    return { ok: false, error: 'Nepodařilo se uložit' };
  }
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function updateEntryAction(
  entryId: string,
  patch: { description?: string; clientId?: string | null; projectId?: string | null; tagIds?: string[]; startedAt?: string; endedAt?: string | null },
): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await updateEntry(prisma(), s.userId, entryId, {
    description: patch.description,
    clientId: patch.clientId ?? undefined,
    projectId: patch.projectId ?? undefined,
    tagIds: patch.tagIds,
    ...(patch.startedAt ? { startedAt: new Date(patch.startedAt) } : {}),
    ...(patch.endedAt !== undefined
      ? { endedAt: patch.endedAt ? new Date(patch.endedAt) : null }
      : {}),
  });
  if (!result.ok) {
    if (result.reason === 'invalid_window')
      return { ok: false, error: 'Konec musí být po začátku' };
    if (result.reason === 'future_timestamp')
      return { ok: false, error: 'Nelze zadat budoucí čas' };
    return { ok: false, error: 'Nelze upravit' };
  }
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function deleteEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await softDeleteEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze smazat' };
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function restoreEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await restoreEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze obnovit' };
  revalidatePath('/trash');
  return { ok: true };
}

export async function playAgainAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const original = await prisma().timeEntry.findUnique({
    where: { id: entryId },
    include: { tags: true },
  });
  if (!original || original.companyId !== s.activeCompanyId) {
    return { ok: false, error: 'Záznam nenalezen' };
  }
  await startTimer(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    description: original.description,
    clientId: original.clientId,
    projectId: original.projectId,
    tagIds: original.tags.map((t) => t.tagId),
  });
  revalidatePath('/timer');
  revalidatePath('/timesheet');
  return { ok: true };
}
