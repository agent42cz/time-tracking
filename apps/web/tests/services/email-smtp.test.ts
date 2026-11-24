/**
 * Outbound email through a real SMTP server: the app's own `sendMail()` and
 * message builders deliver into a Mailpit container (testcontainers), and the
 * test reads the stored message back over Mailpit's HTTP API. Guards nodemailer
 * upgrades — nothing else in the suite sends a real message.
 */
import net from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { inviteEmail, magicLinkEmail, passwordResetEmail, sendMail } from '../../src/lib/email.js';

const SMTP_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE'];
const FROM = 'noreply@tracker.example.test';

let container: StartedTestContainer;
let api: string;
const savedEnv = new Map<string, string | undefined>();

function tcpReachable(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

beforeAll(async () => {
  container = await new GenericContainer('axllent/mailpit:v1.34.0')
    .withEnvironment({ MP_SMTP_AUTH_ACCEPT_ANY: '1', MP_SMTP_AUTH_ALLOW_INSECURE: '1' })
    .withExposedPorts(1025, 8025)
    // Same reason as @tt/db/test: the image's own health check works in CI and
    // in a sibling-container sandbox, a client-side port probe only in CI.
    .withWaitStrategy(Wait.forHealthCheck())
    .start();

  // Mapped ports in CI; the container's bridge IP when they are not routable.
  let host = container.getHost();
  let smtpPort = container.getMappedPort(1025);
  let httpPort = container.getMappedPort(8025);
  if (!(await tcpReachable(host, smtpPort))) {
    host = container.getIpAddress('bridge');
    smtpPort = 1025;
    httpPort = 8025;
  }
  api = `http://${host}:${httpPort}/api/v1`;

  for (const key of SMTP_ENV) savedEnv.set(key, process.env[key]);
  // Read by email.ts on the first send; AUTH exercises the credentials path.
  Object.assign(process.env, {
    SMTP_HOST: host,
    SMTP_PORT: String(smtpPort),
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: FROM,
  });
  delete process.env.SMTP_SECURE;
}, 180_000);

afterAll(async () => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await container?.stop();
}, 30_000);

beforeEach(async () => {
  await fetch(`${api}/messages`, { method: 'DELETE' });
});

interface StoredMessage {
  From: { Address: string };
  To: { Address: string }[];
  Subject: string;
  Text: string;
  HTML: string;
  Attachments: unknown[];
  /** SMTP AUTH user the client logged in as (empty without AUTH). */
  Username: string;
}

async function onlyMessage(): Promise<StoredMessage> {
  const list = (await (await fetch(`${api}/messages`)).json()) as { messages: { ID: string }[] };
  expect(list.messages).toHaveLength(1);
  const id = list.messages[0]?.ID ?? '';
  return (await (await fetch(`${api}/message/${id}`)).json()) as StoredMessage;
}

describe('email delivery over SMTP', () => {
  it('US-3: magic-link email arrives with recipient, subject, link in text and HTML', async () => {
    const url = 'https://tracker.example.test/auth/magic?token=abc123';
    await sendMail(magicLinkEmail({ to: 'Jana.Novakova@example.test', url, expiresInMinutes: 15 }));

    const msg = await onlyMessage();
    expect(msg.From.Address).toBe(FROM);
    expect(msg.To.map((a) => a.Address)).toEqual(['Jana.Novakova@example.test']);
    expect(msg.Subject).toBe('Přihlášení do Time Trackeru');
    expect(msg.Text).toContain('platnost 15 minut');
    expect(msg.Text).toContain(url);
    expect(msg.HTML).toContain(`href="${url}"`);
    expect(msg.Attachments).toEqual([]);
    expect(msg.Username).toBe('mailer');
  });

  it('US-3: password-reset email arrives with the reset link', async () => {
    const url = 'https://tracker.example.test/auth/reset?token=def456';
    await sendMail(passwordResetEmail({ to: 'petr@example.test', url, expiresInMinutes: 60 }));

    const msg = await onlyMessage();
    expect(msg.To.map((a) => a.Address)).toEqual(['petr@example.test']);
    expect(msg.Subject).toBe('Reset hesla — Time Tracker');
    expect(msg.Text).toContain(url);
    expect(msg.HTML).toContain(`href="${url}"`);
  });

  it('US-8: invite email keeps a non-ASCII company name intact in subject and body', async () => {
    const url = 'https://tracker.example.test/invite/ghi789';
    await sendMail(
      inviteEmail({
        to: 'novy@example.test',
        companyName: 'Žluťoučký kůň s.r.o.',
        url,
        expiresInDays: 7,
      }),
    );

    const msg = await onlyMessage();
    expect(msg.To.map((a) => a.Address)).toEqual(['novy@example.test']);
    expect(msg.Subject).toBe('Pozvánka do firmy Žluťoučký kůň s.r.o.');
    expect(msg.Text).toContain('byli jste pozváni do firmy "Žluťoučký kůň s.r.o."');
    expect(msg.HTML).toContain(`href="${url}"`);
  });
});
