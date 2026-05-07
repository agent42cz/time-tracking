# Business context

## Why this project exists

Replace Clockify for personal and small-agency use with a self-hosted, multi-tenant alternative — without losing the core tracking + reporting features. Full data ownership, no per-seat fees, no vendor lock-in.

## Stakeholders

- **Owner:** Michal.
- **Target deployment:** Coolify on Netcup VPS (Debian).
- **Users:** invited members of one or more companies. There is no public sign-up.

## Goals

- Replace Clockify for personal and agency use without losing core functionality (timer, parallel timers, projects/tags, weekly view, exports).
- Multiple independent companies (tenants) with proper isolation.
- Chrome extension that mirrors the web app in real time.
- Czech UI, Europe/Prague timezone.
- Self-hostable on Coolify with Postgres.

## Non-goals (v1)

- Billing, invoicing, hourly rates, or any monetary calculations.
- Approval workflows for timesheets.
- Mobile native apps (iOS / Android).
- Firefox / Safari / Edge extensions (Chromium-only — Brave/Arc/Edge inherit Chrome).
- Multi-language UI.
- Multi-timezone support.
- Native integrations with third-party tools (Slack, Jira, etc.).

## Users and roles

One account type — a registered user. Users can only register via an **invite link**. The first user is created via CLI/seed during deployment.

Each user has a role **per company** they belong to:

| Role      | Permissions                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admin** | Full access: manage clients/projects/tags/members, view all members' time entries, dashboard, exports, audit log, delete the company.                                                |
| **User**  | Track own time, read-only on clients/projects/tags, view + edit own entries, manage tags-on-entries. Cannot create/edit/delete clients or projects. Cannot see other users' entries. |

A user can belong to multiple companies; their role is per company. Any Admin can promote/demote members or delete the company. The "last Admin" guard blocks self-removal that would leave a company without one.

## Success criteria

v1 ships when every checkbox in [`../reference/acceptance.md`](../reference/acceptance.md) is ticked with a passing test. v1 was declared complete on 2026-05-03; see [`../architecture/build-log.md`](../architecture/build-log.md) for the chronological record.

## Open questions for later

- Per-user setting for "default client/project" to pre-fill the timer.
- Dashboard period comparison (this month vs. last month).
- Recurring/scheduled time entries (e.g., daily standup auto-logged) — likely v2.
- Public API for third-party integrations — not in scope; data model should not block it.
