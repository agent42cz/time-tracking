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
└── clients[] → Client

Membership
├── user_id, company_id, role (admin | user), joined_at
└── unique on (user_id, company_id)

Invite
├── id, company_id, email, role, token (sha256-hashed), expires_at
├── invited_by, accepted_at (nullable)
└── status (pending | accepted | revoked | expired)

Client
├── id, company_id, name, archived (bool), created_at
├── fundInDashboard (bool, default false) — show this client's work-fund progress bars on the web dashboard + extension
├── weeklyFundMinutes (int, nullable) — agreed weekly hour commitment, in minutes
├── weekStartsOn (int, nullable) — ISO weekday the client's fund week starts on (1=Mon … 7=Sun)
├── workingDays (int[], default []) — ISO weekdays the fund is worked on; empty = "hours-only" client (no per-day breakdown, proportional monthly target)
└── projects[] → Project

Project
├── id, client_id, name, archived (bool), created_at

TimeEntry
├── id, user_id, company_id
├── client_id (nullable), project_id (nullable)
├── description (text)
├── started_at, ended_at (nullable while running)
├── deleted_at (nullable; soft delete)
└── created_at, updated_at

Absence
├── id, company_id, user_id
├── kind (vacation | sick | doctor | personal | other)
├── start_date, end_date — bare DATE columns; an absence is a calendar-day fact,
│   so it must not shift when the server runs UTC and the user is in Prague
├── note (text, max 500)
└── created_at, updated_at

AbsenceRead
├── id, absence_id, user_id, seen_at
└── unique on (absence_id, user_id) — "seen" is per viewer, not per absence

AuditLog
├── id, company_id, actor_user_id
├── action (create | update | delete | restore | purge | invite | remove_member | role_change | login | …)
├── entity_type, entity_id
├── before (jsonb), after (jsonb)
└── created_at — immutable; no service may update or delete rows
```

## Auth helpers

The `User`, `Account`, `Session` and `VerificationToken` tables keep their Auth.js-shaped columns for historical reasons (ADR-0014) but are driven entirely by the app's own code. Four further tables back custom flows:

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

## Absence notices (Nepřítomnost)

- A member files an `Absence` for the days they won't be available. The only rule is that the first day must be **at least one day away**; absence length affects nothing — see [ADR-0016](../decisions/0016-absence-notices-manual-entry-and-per-viewer-seen-state.md).
- Admins read the whole company; a plain member reads only their own rows.
- The nav badge counts absences an admin has neither written nor acknowledged and that haven't ended. Opening a row, or "Označit vše jako přečtené", writes an `AbsenceRead`. Editing an absence deletes its `AbsenceRead` rows so the change re-notifies.
- `AbsenceRead` writes are deliberately **not** audited (view state, not company data); create / update / delete of the `Absence` itself each write exactly one audit row with `entity_type = 'absence'`.
- Those audit rows carry **only the owner and the affected days** — never `kind` or `note`. The reason for an absence is health-adjacent personal data and audit rows are immutable and outlive the absence; see [ADR-0016](../decisions/0016-absence-notices-manual-entry-and-per-viewer-seen-state.md).
- `createAbsence` caps an author at **20 notices per hour** (`ABSENCE_MAX_PER_HOUR`), counted off `created_at`.
- Web only — the Chrome extension does not expose this section.

## Multi-tenant scoping

Every read endpoint filters by the active `company_id` from the session. Cross-tenant attempts return **404** (not 403) to avoid existence leaks. See [`../constitution.md`](../constitution.md) §3.
