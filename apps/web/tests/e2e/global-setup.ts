import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createSession } from '../../src/lib/auth/sessions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';

export interface SeededWorld {
  companyId: string;
  adminUserId: string;
  clients: { id: string; name: string }[];
  projects: { id: string; clientId: string; name: string }[];
}

async function resetData(prisma: PrismaClient): Promise<void> {
  await prisma.timeEntryTag.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.totpRecoveryCode.deleteMany();
  await prisma.passwordLoginAttempt.deleteMany();
  await prisma.magicLink.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
}

async function seed(prisma: PrismaClient): Promise<SeededWorld> {
  await resetData(prisma);

  const admin = await prisma.user.create({
    data: { email: E2E_ADMIN_EMAIL, fullName: 'E2E Admin' },
  });
  const company = await prisma.company.create({
    data: { name: 'E2E Co', slug: `e2e-co-${Date.now()}`, createdById: admin.id },
  });
  await prisma.membership.create({
    data: { userId: admin.id, companyId: company.id, role: 'admin' },
  });

  const clientA = await prisma.client.create({
    data: { companyId: company.id, name: 'Agent 42', sortOrder: 1 },
  });
  const clientB = await prisma.client.create({
    data: { companyId: company.id, name: 'Agént Diakritika', sortOrder: 2 },
  });
  const clientC = await prisma.client.create({
    data: { companyId: company.id, name: 'Old Co', archived: true, sortOrder: 3 },
  });

  const projectGoogle = await prisma.project.create({
    data: { clientId: clientA.id, name: 'Google Work Space', sortOrder: 1 },
  });
  const projectInstall = await prisma.project.create({
    data: { clientId: clientA.id, name: 'Instalace agenta', sortOrder: 2 },
  });
  const projectVps = await prisma.project.create({
    data: { clientId: clientA.id, name: 'Nastavování VPS', sortOrder: 3 },
  });

  return {
    companyId: company.id,
    adminUserId: admin.id,
    clients: [
      { id: clientA.id, name: clientA.name },
      { id: clientB.id, name: clientB.name },
      { id: clientC.id, name: clientC.name },
    ],
    projects: [
      { id: projectGoogle.id, clientId: clientA.id, name: projectGoogle.name },
      { id: projectInstall.id, clientId: clientA.id, name: projectInstall.name },
      { id: projectVps.id, clientId: clientA.id, name: projectVps.name },
    ],
  };
}

export default async function globalSetup(): Promise<SeededWorld> {
  const prisma = new PrismaClient();
  await prisma.$connect();
  let world: SeededWorld;
  try {
    world = await seed(prisma);
    const session = await createSession(prisma, world.adminUserId);

    const dir = join(__dirname, '.auth');
    await mkdir(dir, { recursive: true });

    const oneMonthFromNow = Math.floor(session.expiresAt.getTime() / 1000);
    const storageState = {
      cookies: [
        {
          name: 'tt-session',
          value: session.token,
          domain: 'localhost',
          path: '/',
          expires: oneMonthFromNow,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
        {
          name: 'tt-company',
          value: world.companyId,
          domain: 'localhost',
          path: '/',
          expires: oneMonthFromNow,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    };
    await writeFile(join(dir, 'admin.json'), JSON.stringify(storageState, null, 2), 'utf8');
    await writeFile(join(dir, 'world.json'), JSON.stringify(world, null, 2), 'utf8');
  } finally {
    await prisma.$disconnect();
  }
  return world;
}
