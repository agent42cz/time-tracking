'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, requireAdmin, requireUser, setActiveCompany } from '../session.js';
import {
  changeRole,
  createCompany,
  createInvite,
  deleteCompany,
  leaveCompany,
  removeMember,
  resendInvite,
  revokeInvite,
} from '../services/companies.js';
import { inviteEmail, sendMail } from '../email.js';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCompanyAction(formData: FormData): Promise<ActionResult> {
  const s = await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Vyplňte název' };
  const c = await createCompany(prisma(), { name, createdByUserId: s.userId });
  await setActiveCompany(c.id);
  revalidatePath('/');
  redirect('/timer');
}

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  const s = await requireAdmin();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? 'user') === 'admin' ? 'admin' : 'user';
  if (!/^[^@]+@[^@]+$/.test(email)) return { ok: false, error: 'Neplatný e-mail' };
  const r = await createInvite(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    email,
    role,
  });
  if (!r.ok) return { ok: false, error: 'Nelze pozvat' };
  const company = await prisma().company.findUniqueOrThrow({
    where: { id: s.activeCompanyId },
  });
  const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/invite/${encodeURIComponent(
    r.value.token,
  )}`;
  try {
    await sendMail(inviteEmail({ to: email, companyName: company.name, url, expiresInDays: 7 }));
  } catch {
    // Email is best-effort; the invite still exists. Surface a soft warning.
  }
  revalidatePath('/members');
  return { ok: true };
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await revokeInvite(prisma(), s.userId, inviteId);
  if (!r.ok) return { ok: false, error: 'Nelze zrušit' };
  revalidatePath('/members');
  return { ok: true };
}

export async function resendInviteAction(inviteId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await resendInvite(prisma(), s.userId, inviteId);
  if (!r.ok) return { ok: false, error: 'Nelze odeslat znovu' };
  const invite = await prisma().invite.findUniqueOrThrow({
    where: { id: inviteId },
    include: { company: true },
  });
  const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/invite/${encodeURIComponent(
    r.value.token,
  )}`;
  try {
    await sendMail(
      inviteEmail({
        to: invite.email,
        companyName: invite.company.name,
        url,
        expiresInDays: 7,
      }),
    );
  } catch {
    // ignore — invite is in DB regardless
  }
  revalidatePath('/members');
  return { ok: true };
}

export async function changeRoleAction(
  targetUserId: string,
  newRole: 'admin' | 'user',
): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await changeRole(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    targetUserId,
    newRole,
  });
  if (!r.ok) {
    if (r.reason === 'last_admin')
      return { ok: false, error: 'Nelze degradovat posledního správce' };
    return { ok: false, error: 'Nelze' };
  }
  revalidatePath('/members');
  return { ok: true };
}

export async function removeMemberAction(targetUserId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  const r = await removeMember(prisma(), s.userId, {
    companyId: s.activeCompanyId,
    targetUserId,
  });
  if (!r.ok) {
    if (r.reason === 'last_admin')
      return { ok: false, error: 'Nelze odebrat posledního správce' };
    return { ok: false, error: 'Nelze' };
  }
  revalidatePath('/members');
  return { ok: true };
}

export async function leaveCompanyAction(companyId: string): Promise<ActionResult> {
  const s = await requireUser();
  const r = await leaveCompany(prisma(), s.userId, companyId);
  if (!r.ok) {
    if (r.reason === 'last_admin')
      return { ok: false, error: 'Jako poslední správce nemůžete firmu opustit' };
    return { ok: false, error: 'Nelze' };
  }
  revalidatePath('/companies');
  return { ok: true };
}

export async function deleteCompanyAction(companyId: string): Promise<ActionResult> {
  const s = await requireUser();
  const r = await deleteCompany(prisma(), s.userId, companyId);
  if (!r.ok) return { ok: false, error: 'Nelze smazat' };
  await setActiveCompany(null);
  redirect('/companies');
}
