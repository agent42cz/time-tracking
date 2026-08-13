'use server';

import { revalidatePath } from 'next/cache';
import { prisma, requireActiveCompany } from '../session.js';
import {
  createAbsence,
  deleteAbsence,
  markAbsenceSeen,
  markAllAbsencesSeen,
  updateAbsence,
  type AbsenceError,
} from '../services/absences.js';

export type ActionResult = { ok: true } | { ok: false; error: string };

function messageFor(reason: AbsenceError): string {
  switch (reason) {
    case 'too_late':
      return 'Nepřítomnost hlaste nejpozději den předem.';
    case 'end_before_start':
      return 'Konec nemůže být dřív než začátek.';
    case 'invalid_day':
      return 'Vyplňte platné datum.';
    case 'invalid':
      return 'Neplatné údaje.';
    case 'rate_limited':
      return 'Příliš mnoho záznamů za sebou. Zkuste to prosím za chvíli.';
    case 'not_found':
      return 'Záznam nenalezen.';
  }
}

function revalidateAbsences(): void {
  revalidatePath('/absence');
  // The nav badge is rendered by the authenticated layout.
  revalidatePath('/', 'layout');
}

export async function createAbsenceAction(formData: FormData): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const startDate = String(formData.get('startDate') ?? '');
  const endDate = String(formData.get('endDate') ?? '') || startDate;
  const r = await createAbsence(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    kind: String(formData.get('kind') ?? 'other'),
    startDate,
    endDate,
    note: String(formData.get('note') ?? ''),
  });
  if (!r.ok) return { ok: false, error: messageFor(r.reason) };
  revalidateAbsences();
  return { ok: true };
}

export async function updateAbsenceAction(
  absenceId: string,
  patch: { kind?: string; startDate?: string; endDate?: string; note?: string },
): Promise<ActionResult> {
  const s = await requireActiveCompany();
  // Rebuild the patch field by field. `patch` arrives over the server-action
  // boundary, so it is untrusted data whatever its declared type says.
  const r = await updateAbsence(prisma(), s.userId, absenceId, {
    kind: patch.kind,
    startDate: patch.startDate,
    endDate: patch.endDate,
    note: patch.note,
  });
  if (!r.ok) return { ok: false, error: messageFor(r.reason) };
  revalidateAbsences();
  return { ok: true };
}

export async function deleteAbsenceAction(absenceId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const r = await deleteAbsence(prisma(), s.userId, absenceId);
  if (!r.ok) return { ok: false, error: messageFor(r.reason) };
  revalidateAbsences();
  return { ok: true };
}

export async function markAbsenceSeenAction(absenceId: string): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const r = await markAbsenceSeen(prisma(), s.userId, absenceId);
  if (!r.ok) return { ok: false, error: messageFor(r.reason) };
  revalidateAbsences();
  return { ok: true };
}

export async function markAllAbsencesSeenAction(): Promise<ActionResult> {
  const s = await requireActiveCompany();
  const r = await markAllAbsencesSeen(prisma(), s.userId, s.activeCompanyId);
  if (!r.ok) return { ok: false, error: messageFor(r.reason) };
  revalidateAbsences();
  return { ok: true };
}
