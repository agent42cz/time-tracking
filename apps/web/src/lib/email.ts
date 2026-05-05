/**
 * Nodemailer transport — reads SMTP config from env at first use.
 * Used for magic-link emails and (later) invite notifications.
 */
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';

let _transport: Transporter | undefined;

function transport(): Transporter {
  if (_transport) return _transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  if (!host) throw new Error('SMTP_HOST is required');
  _transport = createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return _transport;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const from = process.env.SMTP_FROM ?? 'noreply@example.test';
  await transport().sendMail({ from, ...msg });
}

export function magicLinkEmail(opts: {
  to: string;
  url: string;
  expiresInMinutes: number;
}): MailMessage {
  const text = [
    'Dobrý den,',
    '',
    `pro přihlášení klikněte na následující odkaz (platnost ${opts.expiresInMinutes} minut):`,
    opts.url,
    '',
    'Pokud jste o odkaz nežádali, ignorujte tuto zprávu.',
    '',
    '— Agent42 Time Tracker',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
      <h2 style="margin:0 0 16px;font-size:20px">Přihlášení do Time Trackeru</h2>
      <p>Klikněte na tlačítko níže (platnost <strong>${opts.expiresInMinutes} min</strong>):</p>
      <p style="margin:24px 0">
        <a href="${opts.url}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Přihlásit se</a>
      </p>
      <p style="color:#71717a;font-size:13px">Pokud jste o odkaz nežádali, ignorujte zprávu.</p>
    </div>
  `.trim();
  return { to: opts.to, subject: 'Přihlášení do Time Trackeru', text, html };
}

export function passwordResetEmail(opts: {
  to: string;
  url: string;
  expiresInMinutes: number;
}): MailMessage {
  const text = [
    'Dobrý den,',
    '',
    `obdrželi jsme žádost o reset hesla. Klikněte na odkaz níže (platnost ${opts.expiresInMinutes} minut) a nastavte si nové heslo:`,
    opts.url,
    '',
    'Pokud jste o reset nežádali, ignorujte tuto zprávu — heslo zůstane beze změny.',
    '',
    '— Agent42 Time Tracker',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
      <h2 style="margin:0 0 16px;font-size:20px">Reset hesla — Time Tracker</h2>
      <p>Klikněte na tlačítko níže a nastavte si nové heslo (platnost <strong>${opts.expiresInMinutes} min</strong>):</p>
      <p style="margin:24px 0">
        <a href="${opts.url}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Nastavit nové heslo</a>
      </p>
      <p style="color:#71717a;font-size:13px">Pokud jste o reset nežádali, ignorujte zprávu — heslo zůstane beze změny.</p>
    </div>
  `.trim();
  return { to: opts.to, subject: 'Reset hesla — Time Tracker', text, html };
}

export function inviteEmail(opts: {
  to: string;
  companyName: string;
  url: string;
  expiresInDays: number;
}): MailMessage {
  const text = [
    'Dobrý den,',
    '',
    `byli jste pozváni do firmy "${opts.companyName}" v Time Trackeru.`,
    '',
    `Pozvánku přijměte zde (platnost ${opts.expiresInDays} dní):`,
    opts.url,
    '',
    '— Agent42 Time Tracker',
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
      <h2 style="margin:0 0 16px;font-size:20px">Pozvánka do firmy „${opts.companyName}"</h2>
      <p>Pozvánku přijměte kliknutím (platnost <strong>${opts.expiresInDays} dní</strong>):</p>
      <p style="margin:24px 0">
        <a href="${opts.url}" style="background:#18181b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">Přijmout pozvánku</a>
      </p>
    </div>
  `.trim();
  return { to: opts.to, subject: `Pozvánka do firmy ${opts.companyName}`, text, html };
}
