'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { loginWithMagicLink, loginWithPassword } from '../auth/login.js';
import { issueMagicLink } from '../auth/magic-link.js';
import {
  acceptInviteAsExistingUser,
  acceptInviteAsNewUser,
} from '../auth/signup.js';
import {
  beginEnrollment,
  confirmEnrollment,
  disableTotp,
} from '../auth/totp-enrollment.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { magicLinkEmail, sendMail } from '../email.js';
import {
  clearSessionCookie,
  prisma,
  setActiveCompany,
  setSessionCookie,
} from '../session.js';
import { createSession, invalidateSession } from '../auth/sessions.js';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../session.js';

export type ActionResult = { ok: true } | { ok: false; error: string };

export type PasswordLoginActionResult =
  | { ok: false; error: string; reason: 'totp_required' | 'totp_invalid' | 'locked' | 'invalid_credentials' };

export async function passwordLoginAction(
  formData: FormData,
): Promise<PasswordLoginActionResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const totpCode = String(formData.get('totp') ?? '').trim() || undefined;
  const result = await loginWithPassword(prisma(), { email, password, totpCode });
  if (!result.ok) {
    if (result.reason === 'totp_required')
      return { ok: false, reason: 'totp_required', error: 'Zadejte kód z aplikace' };
    if (result.reason === 'totp_invalid')
      return { ok: false, reason: 'totp_invalid', error: 'Neplatný kód' };
    if (result.reason === 'locked')
      return {
        ok: false,
        reason: 'locked',
        error: 'Účet je dočasně uzamčen kvůli mnoha neúspěšným pokusům',
      };
    return { ok: false, reason: 'invalid_credentials', error: 'Neplatné přihlašovací údaje' };
  }
  await setSessionCookie(result.sessionToken);
  redirect('/timer');
}

export async function magicLinkSendAction(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').toLowerCase();
  const user = await prisma().user.findUnique({ where: { email } });
  // Always claim success to avoid email enumeration.
  if (!user) return { ok: true };
  const link = await issueMagicLink(prisma(), user.id);
  const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/login/magic?token=${encodeURIComponent(
    link.token,
  )}`;
  await sendMail(magicLinkEmail({ to: email, url, expiresInMinutes: 15 }));
  return { ok: true };
}

export async function magicLinkConsumeAction(token: string): Promise<ActionResult> {
  const result = await loginWithMagicLink(prisma(), { token });
  if (!result.ok) {
    if (result.reason === 'totp_required')
      return { ok: false, error: 'Tento účet vyžaduje 2FA — přihlaste se heslem' };
    return { ok: false, error: 'Odkaz je neplatný nebo již vypršel' };
  }
  await setSessionCookie(result.sessionToken);
  redirect('/timer');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(prisma(), token);
  await clearSessionCookie();
  redirect('/login');
}

export async function inviteAcceptAsNewAction(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get('token') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (fullName.length < 1) return { ok: false, error: 'Vyplňte jméno' };
  if (password.length < 12) return { ok: false, error: 'Heslo musí mít aspoň 12 znaků' };
  const result = await acceptInviteAsNewUser(prisma(), { token, fullName, password });
  if (!result.ok) return { ok: false, error: friendlyInviteReason(result.reason) };
  // Auto-login: create a session for the new user directly.
  const session = await createSession(prisma(), result.userId);
  await setSessionCookie(session.token);
  await setActiveCompany(result.companyId);
  redirect('/timer');
}

export async function inviteAcceptAsExistingAction(token: string): Promise<ActionResult> {
  // Caller must already be logged in (server-side check in the page).
  const { getSession } = await import('../session.js');
  const session = await getSession();
  if (!session) return { ok: false, error: 'Nejprve se přihlaste' };
  const result = await acceptInviteAsExistingUser(prisma(), { token, userId: session.userId });
  if (!result.ok) return { ok: false, error: friendlyInviteReason(result.reason) };
  await setActiveCompany(result.companyId);
  revalidatePath('/');
  redirect('/timer');
}

function friendlyInviteReason(r: string): string {
  switch (r) {
    case 'expired':
      return 'Pozvánka vypršela';
    case 'revoked':
      return 'Pozvánka byla zrušena';
    case 'already_accepted':
      return 'Pozvánka již byla použita';
    default:
      return 'Pozvánka nebyla nalezena';
  }
}

export async function switchCompanyAction(companyId: string): Promise<void> {
  await setActiveCompany(companyId);
  revalidatePath('/');
  redirect('/timer');
}

// --- Settings ---
export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  const { getSession } = await import('../session.js');
  const session = await getSession();
  if (!session) return { ok: false, error: 'Nepřihlášeno' };
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  if (next.length < 12) return { ok: false, error: 'Nové heslo musí mít aspoň 12 znaků' };
  const user = await prisma().user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
    return { ok: false, error: 'Současné heslo není správné' };
  }
  await prisma().user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(next) },
  });
  return { ok: true };
}

export async function totpBeginAction(): Promise<
  ActionResult | { ok: true; secret: string; otpauthUrl: string }
> {
  const { getSession } = await import('../session.js');
  const session = await getSession();
  if (!session) return { ok: false, error: 'Nepřihlášeno' };
  const e = await beginEnrollment(prisma(), session.userId);
  return { ok: true, ...e };
}

export async function totpConfirmAction(
  code: string,
): Promise<ActionResult | { ok: true; recoveryCodes: string[] }> {
  const { getSession } = await import('../session.js');
  const session = await getSession();
  if (!session) return { ok: false, error: 'Nepřihlášeno' };
  try {
    const r = await confirmEnrollment(prisma(), session.userId, code);
    return { ok: true, recoveryCodes: r.recoveryCodes };
  } catch {
    return { ok: false, error: 'Neplatný kód' };
  }
}

export async function totpDisableAction(): Promise<ActionResult> {
  const { getSession } = await import('../session.js');
  const session = await getSession();
  if (!session) return { ok: false, error: 'Nepřihlášeno' };
  await disableTotp(prisma(), session.userId);
  return { ok: true };
}
