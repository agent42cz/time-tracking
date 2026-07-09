# Data model

Source of truth: [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma). This document is a human-readable summary; if it disagrees with the schema, the schema wins.

## Entities

```
User
├── id, email (unique), password_hash (nullable for magic-link-only)
├── full_name, totp_secret (nullable), created_at
└── memberships[] → Company

Company
├── id, name, slug (unique), created_at, created_by
├── members[] → User (via Membership)
├── clients[] → Client
└── tags[] → Tag

Membership
├── user_id, company_id, role (admin | user), joined_at
└── unique on (user_id, company_id)

Invite
├── id, company_id, email, role, token (sha256-hashed), expires_at
├── invited_by, accepted_at (nullable)
└── status (pending | accepted | revoked | expired)

Client
├── id, company_id, name, archived (bool), created_at
└── projects[] → Project

Project
├── id, client_id, name, archived (bool), created_at

Tag
├── id, company_id, name, color, created_at
└── company-scoped (every member of a company sees the same set)

TimeEntry
├── id, user_id, company_id
├── client_id (nullable), project_id (nullable)
├── description (text)
├── started_at, ended_at (nullable while running)
├── tags[] → Tag (many-to-many)
├── deleted_at (nullable; soft delete)
└── created_at, updated_at

AuditLog
├── id, company_id, actor_user_id
├── action (create | update | delete | restore | purge | invite | remove_member | role_change | login | …)
├── entity_type, entity_id
├── before (jsonb), after (jsonb)
└── created_at — immutable; no service may update or delete rows
```

## Auth helpers (Auth.js v5 + custom)

In addition to Auth.js's standard tables (`User`, `Account`, `Session`, `VerificationToken`), four app-specific tables back custom flows:

- **`MagicLink`** — single-use email login tokens (15-min expiry, SHA-256 hash on the token).
- **`PasswordLoginAttempt`** — sliding-window counter for password rate-limit / lockout.
- **`EmailSendAttempt`** — sliding-window counter for outbound auth emails (password reset + magic link), per target email and per source IP; rows are written even for unknown emails so the limiter can't be probed around.
- **`TotpRecoveryCode`** — 10 single-use recovery codes generated on TOTP enable.

## Cascading rules on delete

When an Admin deletes a Client or Project, the API surface accepts a `cascade: boolean` flag and the UI prompts:

> _"This [client/project] has N time entries. Delete them too?"_

- **`cascade: true`** → soft-delete the entity AND all linked TimeEntries.
- **`cascade: false`** → soft-delete the entity; TimeEntries remain but their `client_id` / `project_id` is nulled. Entries display as `(deleted client)` / `(deleted project)`.

## User removal from a company

When a member is removed from a company, **their TimeEntries remain in that company under their name**. They lose access; reports stay accurate after offboarding.

The "last admin" guard blocks any role change, removal, or self-leave that would leave the company without an admin. See US-50 and `apps/web/tests/services/companies.test.ts`.

## Soft delete + trash

- TimeEntry deletion sets `deleted_at` to `now()`. Entries with non-null `deleted_at` are hidden from normal queries and reports (US-47).
- The `/trash` page lists soft-deleted entries and allows restore, scoped by role: a member sees only their own; an admin sees every member's in the active company (US-94).
- A daily Coolify scheduled task calls `POST /api/cron/purge`, which hard-deletes any TimeEntry with `deleted_at < now() - 30 days` and writes one actor-less `purge` audit row per entry. See [ADR-0011](../decisions/0011-coolify-scheduled-task-for-purge.md).

## Multi-tenant scoping

Every read endpoint filters by the active `company_id` from the session. Cross-tenant attempts return **404** (not 403) to avoid existence leaks. See [`../constitution.md`](../constitution.md) §3.
