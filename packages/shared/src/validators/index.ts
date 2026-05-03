/**
 * Zod validators shared by API routes and the extension popup.
 */
import { z } from 'zod';

export const RoleSchema = z.enum(['admin', 'user']);
export type Role = z.infer<typeof RoleSchema>;

export const InviteStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);
export type InviteStatus = z.infer<typeof InviteStatusSchema>;

export const AuditActionSchema = z.enum([
  'create',
  'update',
  'delete',
  'restore',
  'invite',
  'invite_accepted',
  'invite_revoked',
  'remove_member',
  'role_change',
  'login',
  'logout',
  'totp_enable',
  'totp_disable',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const EmailSchema = z.string().email().max(254).toLowerCase();
export const PasswordSchema = z.string().min(12).max(256);
export const FullNameSchema = z.string().min(1).max(120);

export const TagColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Color must be a hex like #aabbcc');

export const TimeEntryInputSchema = z
  .object({
    description: z.string().max(2000).default(''),
    clientId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    tagIds: z.array(z.string().uuid()).default([]),
    startedAt: z.coerce.date(),
    endedAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (v) => v.endedAt === null || v.endedAt === undefined || v.endedAt > v.startedAt,
    { message: 'endedAt must be after startedAt', path: ['endedAt'] },
  )
  .refine((v) => v.startedAt.getTime() <= Date.now() + 60_000, {
    message: 'startedAt cannot be in the future',
    path: ['startedAt'],
  })
  .refine(
    (v) => v.endedAt == null || v.endedAt.getTime() <= Date.now() + 60_000,
    { message: 'endedAt cannot be in the future', path: ['endedAt'] },
  );

export type TimeEntryInput = z.infer<typeof TimeEntryInputSchema>;

export const InviteCreateSchema = z.object({
  email: EmailSchema,
  role: RoleSchema,
});

export const SignupFromInviteSchema = z.object({
  token: z.string().min(16),
  fullName: FullNameSchema,
  password: PasswordSchema,
});

export const PasswordLoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});
