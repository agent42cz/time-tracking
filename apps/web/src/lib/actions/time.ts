'use server';

import { revalidatePath } from 'next/cache';
import { parseAppZoneInput } from '@tt/shared/time';
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
  return { ok: true };
}

export async function stopTimerAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await stopTimer(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Měření nelze zastavit' };
  revalidatePath('/timer');
  return { ok: true };
}

export async function createManualAction(formData: FormData): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const date = String(formData.get('date') ?? '');
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  if (!DATE_RE.test(date) || !TIME_RE.test(from) || !TIME_RE.test(to)) {
    return { ok: false, error: 'Vyplňte datum a čas' };
  }
  const startedAt = parseAppZoneInput(date, from);
  const endedAt = parseAppZoneInput(date, to);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return { ok: false, error: 'Vyplňte datum a čas' };
  }
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
  return { ok: true };
}

export async function updateEntryAction(
  entryId: string,
  patch: {
    description?: string;
    note?: string;
    clientId?: string | null;
    projectId?: string | null;
    tagIds?: string[];
    startedAt?: string;
    endedAt?: string | null;
  },
): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await updateEntry(prisma(), s.userId, entryId, {
    description: patch.description,
    note: patch.note,
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
  revalidatePath('/reports');
  return { ok: true };
}

export interface EntryEditContext {
  entry: {
    description: string;
    note: string;
    clientId: string | null;
    projectId: string | null;
    tagIds: string[];
    startedAt: string; // ISO
    endedAt: string | null; // ISO
  };
  clients: { id: string; name: string; projects: { id: string; name: string }[] }[];
  tags: { id: string; name: string; color: string }[];
}

export async function getEntryEditContextAction(
  entryId: string,
): Promise<{ ok: true; data: EntryEditContext } | { ok: false; error: string }> {
  const s = await requireActiveCompany();
  const entry = await prisma().timeEntry.findUnique({
    where: { id: entryId },
    include: { tags: true },
  });
  // Existence-safe: not-found / cross-company / non-owner-non-admin / deleted all
  // collapse to the same not_found string updateEntryAction returns (no leaks).
  if (
    !entry ||
    entry.deletedAt ||
    entry.companyId !== s.activeCompanyId ||
    (entry.userId !== s.userId && s.activeRole !== 'admin')
  ) {
    return { ok: false, error: 'Nelze upravit' };
  }

  const [clients, tags] = await Promise.all([
    prisma().client.findMany({
      where: { companyId: s.activeCompanyId, archived: false },
      include: {
        projects: { where: { archived: false }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma().tag.findMany({ where: { companyId: s.activeCompanyId }, orderBy: { name: 'asc' } }),
  ]);

  return {
    ok: true,
    data: {
      entry: {
        description: entry.description,
        note: entry.note,
        clientId: entry.clientId,
        projectId: entry.projectId,
        tagIds: entry.tags.map((t) => t.tagId),
        startedAt: entry.startedAt.toISOString(),
        endedAt: entry.endedAt?.toISOString() ?? null,
      },
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        projects: c.projects.map((p) => ({ id: p.id, name: p.name })),
      })),
      tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    },
  };
}

export async function deleteEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await softDeleteEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze smazat' };
  revalidatePath('/timer');
  return { ok: true };
}

export async function restoreEntryAction(entryId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const result = await restoreEntry(prisma(), s.userId, entryId);
  if (!result.ok) return { ok: false, error: 'Nelze obnovit' };
  revalidatePath('/trash');
  // Undo (US-94) restores from /timer, which must re-render too.
  revalidatePath('/timer');
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
  return { ok: true };
}
