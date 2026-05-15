'use server';

import { revalidatePath } from 'next/cache';
import { prisma, requireActiveCompany, requireAdmin } from '../session.js';
import {
  archiveClient,
  archiveProject,
  createClient,
  createProject,
  createTag,
  deleteClient,
  deleteProject,
  deleteTag,
  renameClient,
  renameProject,
  reorderClients,
  reorderProjects,
  updateTag,
} from '../services/catalog.js';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createClientAction(formData: FormData): Promise<ActionResult> {
  const s = await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Vyplňte název' };
  const r = await createClient(prisma(), s.userId, { companyId: s.activeCompanyId, name });
  if (!r.ok) return { ok: false, error: 'Nepodařilo se vytvořit' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function renameClientAction(clientId: string, name: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Vyplňte název' };
  if (trimmed.length > 200) return { ok: false, error: 'Název je příliš dlouhý (max 200 znaků)' };
  const r = await renameClient(prisma(), s.userId, clientId, trimmed);
  if (!r.ok)
    return { ok: false, error: r.reason === 'invalid' ? 'Vyplňte název' : 'Nelze přejmenovat' };
  revalidatePath('/clients');
  revalidatePath('/timer');
  return { ok: true };
}

export async function archiveClientAction(
  clientId: string,
  archived: boolean,
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await archiveClient(prisma(), s.userId, clientId, archived);
  if (!r.ok) return { ok: false, error: 'Nelze' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function deleteClientAction(
  clientId: string,
  cascade: boolean,
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await deleteClient(prisma(), s.userId, clientId, { cascade });
  if (!r.ok) return { ok: false, error: 'Nelze smazat' };
  revalidatePath('/clients');
  revalidatePath('/timesheet');
  return { ok: true };
}

export async function createProjectAction(formData: FormData): Promise<ActionResult> {
  const s = await requireAdmin();
  const clientId = String(formData.get('clientId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!clientId || !name) return { ok: false, error: 'Vyplňte klienta a název' };
  const r = await createProject(prisma(), s.userId, { clientId, name });
  if (!r.ok) return { ok: false, error: 'Nepodařilo se vytvořit' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function renameProjectAction(projectId: string, name: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Vyplňte název' };
  if (trimmed.length > 200) return { ok: false, error: 'Název je příliš dlouhý (max 200 znaků)' };
  const r = await renameProject(prisma(), s.userId, projectId, trimmed);
  if (!r.ok)
    return { ok: false, error: r.reason === 'invalid' ? 'Vyplňte název' : 'Nelze přejmenovat' };
  revalidatePath('/clients');
  revalidatePath('/timer');
  return { ok: true };
}

export async function archiveProjectAction(
  projectId: string,
  archived: boolean,
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await archiveProject(prisma(), s.userId, projectId, archived);
  if (!r.ok) return { ok: false, error: 'Nelze' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function deleteProjectAction(
  projectId: string,
  cascade: boolean,
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await deleteProject(prisma(), s.userId, projectId, { cascade });
  if (!r.ok) return { ok: false, error: 'Nelze smazat' };
  revalidatePath('/clients');
  return { ok: true };
}

export async function createTagAction(formData: FormData): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const name = String(formData.get('name') ?? '').trim();
  const color = String(formData.get('color') ?? '#6b7280');
  if (!name) return { ok: false, error: 'Vyplňte název' };
  const r = await createTag(prisma(), s.userId, { companyId: s.activeCompanyId, name, color });
  if (!r.ok) return { ok: false, error: 'Nepodařilo se vytvořit' };
  revalidatePath('/tags');
  return { ok: true };
}

export async function updateTagAction(
  tagId: string,
  patch: { name?: string; color?: string },
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await updateTag(prisma(), s.userId, tagId, patch);
  if (!r.ok) return { ok: false, error: 'Nelze' };
  revalidatePath('/tags');
  return { ok: true };
}

export async function deleteTagAction(tagId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await deleteTag(prisma(), s.userId, tagId);
  if (!r.ok) return { ok: false, error: 'Nelze smazat' };
  revalidatePath('/tags');
  return { ok: true };
}

export async function reorderClientsAction(orderedIds: string[]): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await reorderClients(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    orderedIds,
  });
  if (!r.ok) return { ok: false, error: 'Nepodařilo se uložit pořadí' };
  revalidatePath('/clients');
  revalidatePath('/timer');
  return { ok: true };
}

export async function reorderProjectsAction(
  clientId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await reorderProjects(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    clientId,
    orderedIds,
  });
  if (!r.ok) return { ok: false, error: 'Nepodařilo se uložit pořadí' };
  revalidatePath('/clients');
  revalidatePath('/timer');
  return { ok: true };
}
