# PRD: Self-Hosted Time Tracker (Clockify Replacement)

**Status:** Draft v1
**Owner:** Michal
**Target deployment:** Coolify on Netcup VPS

---

## 1. Overview

A self-hosted, multi-tenant time-tracking web application with a Chrome extension companion. Users belong to one or more companies, track time against clients and projects, and admins get a dashboard with reporting and exports. Designed as a feature-focused replacement for Clockify with simpler UX and full data ownership.

### 1.1 Goals

- Replace Clockify for personal and agency use without losing core functionality.
- Support multiple independent companies (tenants) with proper isolation.
- Provide a Chrome extension that mirrors the web app in real time.
- Keep the UI in Czech only.
- Self-hostable on Coolify with Postgres.

### 1.2 Non-goals (out of scope for v1)

- Billing, invoicing, hourly rates, or any monetary calculations.
- Approval workflows for timesheets.
- Mobile native apps (iOS/Android).
- Firefox / Safari / Edge extensions (Chrome only — works on Brave/Arc/Edge via Chromium).
- Multi-language UI.
- Multi-timezone support (CZ only).
- Native integrations with third-party tools (Slack, Jira, etc.).

---

## 2. Users and roles

### 2.1 Account types

There is one account type — a registered user. Users can only register via an **invite link**. There is no public sign-up. The first user (system bootstrap) is created via CLI/seed during deployment.

### 2.2 Company roles

Each user has a role **per company** they belong to:

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage clients, projects, tags, members, view all members' time entries, dashboard, exports, audit log, delete company. |
| **User** | Track own time, view (read-only) the list of clients/projects/tags, view and edit own entries, manage own tags-on-entries. Cannot create/edit/delete clients or projects. Cannot see other users' entries. |

### 2.3 Multi-company membership

- A user can belong to **multiple companies** simultaneously.
- The active company is selected via a **company switcher** in the top bar.
- Every timer, time entry, client, project, and tag belongs to exactly **one company**.
- A user's role is **per company** — they may be Admin in one and User in another.
- A company may have **multiple Admins**. The creator is the first Admin by default.
- Any Admin can promote/demote other members and delete the company.

---

## 3. Data model

### 3.1 Entities

```
User
├── id, email, password_hash (nullable for magic-link-only)
├── full_name, totp_secret (nullable), created_at
└── memberships[] → Company

Company
├── id, name, slug, created_at, created_by
├── members[] → User (via Membership)
├── clients[] → Client
└── tags[] → Tag

Membership
├── user_id, company_id, role (admin|user), joined_at
└── (unique on user_id + company_id)

Invite
├── id, company_id, email, role, token, expires_at
├── invited_by, accepted_at (nullable)
└── status (pending|accepted|revoked|expired)

Client
├── id, company_id, name, archived (bool), created_at
└── projects[] → Project

Project
├── id, client_id, name, archived (bool), created_at

Tag
├── id, company_id, name, color, created_at
└── (shared across all members of the company)

TimeEntry
├── id, user_id, company_id
├── client_id (nullable), project_id (nullable)
├── description (text)
├── started_at, ended_at (nullable while running)
├── tags[] → Tag (many-to-many)
├── deleted_at (nullable, for soft delete)
└── created_at, updated_at

AuditLog
├── id, company_id, actor_user_id
├── action (create|update|delete|restore|invite|remove_member|role_change|...)
├── entity_type, entity_id
├── before (jsonb), after (jsonb)
└── created_at
```

### 3.2 Cascading rules on delete

When an Admin deletes a client or project, the system asks:

> *"This [client/project] has N time entries. Delete them too?"*

- **Yes** → soft-delete the entity AND all linked time entries.
- **No** → soft-delete the entity, time entries remain but their `client_id` / `project_id` is nulled (entries display as `(deleted client)` / `(deleted project)`).

### 3.3 User removal from a company

When a member is removed from a company, **their time entries remain in that company under their name** (they just lose access to the company).

---

## 4. Authentication & security

### 4.1 Login methods

Users can log in via any of these (configured per-user):

1. **Email + password**
2. **Magic link** (email-based, single-use, 15-minute expiry)
3. **TOTP 2FA** (optional, layered on top of #1; required if enabled by user)

Magic link bypasses password but does **not** bypass TOTP if the user has it enabled.

### 4.2 Sessions

- Session cookie, HTTP-only, Secure, SameSite=Lax.
- Session lifetime: 30 days, sliding renewal.
- Logout invalidates session server-side.

### 4.3 Invite flow

1. Admin enters email + role on the *Members* page.
2. Backend creates `Invite` row, sends email with link `/invite/:token`.
3. Recipient opens link:
   - If no account exists → they create one (set name + password, optionally set up 2FA), are auto-added to the company.
   - If account exists → they're prompted to log in, then auto-added.
4. Invite expires in 7 days; Admin can revoke or resend.

### 4.4 2FA

- TOTP only (Google Authenticator, Authy, 1Password, etc.).
- User enables it from their profile, sees a QR code, confirms with one code.
- Recovery codes (10 single-use) generated on enable and downloadable.

---

## 5. Time tracking

### 5.1 Timer

- Click **Start**, enter description, optionally pick client → project, optionally add tags.
- A user can have **multiple timers running in parallel**.
- Stop a running timer to convert it into a finalized time entry.
- Description, client, project, and tags can be edited while running and after stopping.

### 5.2 Manual entries

- User picks date, start time, end time (or duration), fills description/client/project/tags.
- Manual entries can be added retroactively (any past date).

### 5.3 Editing & deletion

- Users can edit/delete their own entries (running or stopped).
- Admins can edit/delete any entry within their company.
- All edits and deletions are recorded in the audit log (before + after snapshots).
- Deletion is **soft delete** — entries are hidden from normal views but recoverable from a *Trash* page (Admin only) for 30 days, then permanently purged by a daily background job.

### 5.4 Tags

- Tags are **company-scoped** (every member of a company sees the same tag set).
- Both Admins and Users can create new tags on the fly when adding/editing an entry.
- Only Admins can rename, recolor, or delete tags from the Tags management page.

---

## 6. Web application

### 6.1 Pages

| Path | Who | Purpose |
|------|-----|---------|
| `/login`, `/invite/:token` | public | auth |
| `/timer` | all members | running timers, today's entries, quick entry form |
| `/timesheet` | all members | calendar/list view of own entries by week, with edit |
| `/clients` | Admin | manage clients & projects (CRUD, archive) |
| `/tags` | Admin (manage), User (view) | manage tags |
| `/members` | Admin | invite, list, change roles, remove members |
| `/dashboard` | Admin | analytics across all members (see §7) |
| `/reports` | Admin | filtered detail tables, exports (see §8) |
| `/audit` | Admin | full audit log with filters |
| `/trash` | Admin | soft-deleted entries, restore or purge |
| `/settings` | all | profile, password, 2FA, magic-link toggle |
| `/companies` | all | list of companies, create new, switch active |

### 6.2 Real-time sync

- The web app and Chrome extension share state via WebSockets (or SSE).
- Starting/stopping a timer in the extension updates the web view within ~1s, and vice versa.
- Edits to entries propagate the same way to all open clients of the same user.

---

## 7. Admin dashboard

The dashboard is for Admins only and aggregates data across **all members of the active company**. Time period selector at the top: **Today / This week / This month / Custom range**.

Required widgets:

1. **Headline KPIs** — total tracked time in period, number of active members in period, count of distinct clients/projects worked on.
2. **People × Time table** — row per member with totals for today / this week / this month / selected range. Click a member → drilldown to their full entry list with descriptions.
3. **Time-by-client pie chart** — share of total time per client in selected period.
4. **Top projects this week** — bar chart of top 10 projects by hours.
5. **Inactive users** — list of company members with **no** time entries in the selected period.
6. **Daily breakdown** — stacked bar chart, hours per day, stacked by client (or by user — toggle).

All widgets respect the current period selector.

---

## 8. Reports & exports

### 8.1 Filters

Available on the Reports page (Admin only) and the user's own Timesheet page (own entries only):

- Date range (presets: today, yesterday, this week, last week, this month, last month, custom).
- Client (multi-select).
- Project (multi-select).
- Member (Admin only, multi-select).
- Tag (multi-select, AND/OR toggle).
- Description text search.

### 8.2 Export formats

Every filtered view can be exported as:

- **CSV**
- **XLSX** (Excel)
- **PDF** (formatted summary report)

Exports respect the active filters and time period.

---

## 9. Audit log

- Every create / update / delete / restore on every entity is logged.
- Also logs: invites sent, invites accepted/revoked, members added/removed, role changes, login events, 2FA enable/disable.
- Admin can view the full firm-wide log at `/audit` with filters (actor, action type, entity, date range).
- Each time entry also has an inline **"View history"** button showing only that entry's changes.
- Audit log entries are **immutable** and cannot be deleted.

---

## 10. Chrome extension

### 10.1 Distribution

- Chrome (Manifest V3), distributed as `.zip` for sideload + Chrome Web Store listing.
- Works on Brave, Arc, Edge by default (Chromium).

### 10.2 Authentication

- User logs in with email + password (with optional 2FA) or magic link directly inside the popup.
- Session token stored in `chrome.storage.local`.

### 10.3 UI / functionality

The popup matches the structure of the Clockify popup the user already uses:

- **Active company switcher** at top.
- **Quick start row**: text input for description, client/project picker, optional tag picker, big Start button. After Start, the row turns into a running-timer row with elapsed time and a Stop button.
- **Multiple parallel running timers** are listed stacked.
- **This week** section, grouped by day (Today, Yesterday, dates), each entry with description, client • project tag, duration, and a "Play again" button to resume that activity as a new timer.
- Edit/delete actions on each entry via a **⋯** menu.

### 10.4 Offline support

- Extension caches the latest data and the user's running timers.
- If offline, timers can still be started/stopped and entries created locally.
- A pending-sync queue holds local mutations.
- On reconnect, the queue is flushed to the server in order; conflicts resolved last-write-wins on the server.
- Visual indicator in the popup when offline / when there are pending unsynced items.

---

## 11. Tech stack

Recommendation (open to discussion):

- **Frontend (web):** Next.js 15 (App Router) + React, TypeScript, Tailwind, shadcn/ui.
- **Backend:** Next.js route handlers + tRPC (or REST, TBD).
- **Database:** PostgreSQL 16, Prisma ORM.
- **Auth:** Auth.js (NextAuth) with credentials + email magic link providers, custom TOTP layer.
- **Real-time sync:** WebSockets via a lightweight server (e.g., `ws` on a dedicated route, or Pusher-compatible self-hosted Soketi).
- **Email:** the existing SMTP already configured on Coolify.
- **Background jobs:** node-cron inside the app (daily purge of trash, expired invites).
- **Extension:** Vite + React + TS, Manifest V3, shares a UI component library with the web app.
- **Deployment:** Single `docker-compose.yml` deployed via Coolify; services: `app`, `postgres`, `ws-server` (if separated). HTTPS via Coolify's Traefik.

---

## 12. Non-functional requirements

- **Localization:** Czech (`cs-CZ`) only. All dates in `dd.MM.yyyy`, times in 24h, durations as `HH:MM:SS`.
- **Timezone:** Europe/Prague hard-coded for v1.
- **Performance:** dashboard for a company with 20 members and 50k entries should render under 1.5s.
- **Backups:** daily Postgres dump to a configurable destination (volume / S3-compatible).
- **Logging:** structured JSON logs to stdout (Coolify-friendly).
- **Monitoring:** healthcheck endpoint at `/api/health` for Beszel.

---

## 13. User stories

Format: *As a [role], I want [action] so that [outcome].*
Personas: **Visitor** (invited, no account yet), **User** (regular member), **Admin** (per-company role).

### 13.1 Onboarding & authentication

- **US-1** — As a Visitor, I want to open an invite link and create an account in one flow, so that I can start tracking time immediately without a separate registration step.
- **US-2** — As a Visitor with an existing account, I want the invite link to log me in and add me to the new company automatically, so that I don't manage two separate accounts.
- **US-3** — As a User, I want to log in with email + password **or** a magic link, so that I have a fallback if I forget my password.
- **US-4** — As a User, I want to enable TOTP 2FA from my profile and download recovery codes, so that I can secure my account against password leaks.
- **US-5** — As a User, I want my session to last 30 days with sliding renewal, so that I'm not forced to log in every day.

### 13.2 Companies & membership

- **US-6** — As a User, I want to create a new company and become its first Admin, so that I can onboard my own team.
- **US-7** — As a User, I want to switch between companies from a top-bar dropdown, so that I can context-switch between my agency work and personal projects without logging out.
- **US-8** — As an Admin, I want to invite a person by email and pre-assign their role (Admin or User), so that they land in the right permission set on first login.
- **US-9** — As an Admin, I want to revoke or resend a pending invite, so that I can fix mistakes (wrong email, expired link).
- **US-10** — As an Admin, I want to promote another member to Admin or demote them back to User, so that responsibility can be shared or rotated.
- **US-11** — As an Admin, I want to remove a member from the company while keeping their historical time entries under their name, so that reports stay accurate after offboarding.
- **US-12** — As an Admin, I want to delete the entire company (with confirmation), so that I can wind down a project I no longer need.

### 13.3 Clients, projects, and tags

- **US-13** — As an Admin, I want to create clients and group projects under them, so that the structure matches how I bill work in real life.
- **US-14** — As an Admin, I want to archive a client or project instead of deleting it, so that historical entries stay readable but the entity disappears from new-timer pickers.
- **US-15** — As an Admin, when I delete a client/project that has time entries attached, I want to be asked whether to delete those entries too or keep them as orphaned, so that I don't accidentally lose history.
- **US-16** — As an Admin, I want to manage a company-wide tag list (rename, recolor, delete), so that tags stay consistent across the team.
- **US-17** — As a User, I want to create a new tag inline while filling out an entry, so that I'm not blocked by waiting for an Admin.
- **US-18** — As a User, I want to see (but not edit) the list of clients, projects, and tags, so that I always pick from the canonical set.

### 13.4 Time tracking — web

- **US-19** — As a User, I want to start a timer with one click after typing a description, so that the friction of starting work is near zero.
- **US-20** — As a User, I want to attach a client, project, and tags to a timer either before starting or while it's running, so that I can categorize without interrupting flow.
- **US-21** — As a User, I want to run multiple timers in parallel, so that I can track overlapping activities (e.g., a meeting while a build runs).
- **US-22** — As a User, I want to stop a timer and have it appear in today's list immediately, so that I can review the day without refreshing.
- **US-23** — As a User, I want to add a manual time entry for any past date, so that I can backfill work I forgot to track.
- **US-24** — As a User, I want to edit any of my past entries (description, time, client, project, tags), so that I can correct mistakes.
- **US-25** — As a User, I want to soft-delete my own entries, so that I can clean up errors while knowing they're recoverable.
- **US-26** — As a User, I want to view my week as a list grouped by day with daily totals, so that I can spot gaps quickly.
- **US-27** — As a User, I want to see the change history of any of my entries, so that I can verify what I or an Admin changed and when.
- **US-28** — As an Admin, I want to edit or delete any member's entry (with the change logged), so that I can correct data when someone leaves or makes a mistake.

### 13.5 Time tracking — Chrome extension

- **US-29** — As a User, I want to log into the extension once and have it stay logged in, so that I don't authenticate every browser session.
- **US-30** — As a User, I want the extension popup to show my running timers and this week's entries, so that I have the same context as the web app.
- **US-31** — As a User, I want changes I make in the extension to appear on the web within ~1 second (and vice versa), so that I trust both surfaces equally.
- **US-32** — As a User, I want to start, stop, edit, and delete entries from the extension popup, so that I rarely need to open the full web app.
- **US-33** — As a User, I want a "Play again" button on past entries, so that I can resume a recurring activity in one click.
- **US-34** — As a User, I want the extension to keep working when I'm offline and sync when I reconnect, so that travel or flaky Wi-Fi doesn't lose my data.
- **US-35** — As a User, I want a visible indicator when there are unsynced local changes, so that I know not to close the browser yet.

### 13.6 Dashboard & reporting

- **US-36** — As an Admin, I want a dashboard showing total time, active members, and top clients/projects for a chosen period (today / week / month / custom), so that I get a one-glance health check on the team.
- **US-37** — As an Admin, I want to see a per-member table with totals across periods, so that I can compare workloads.
- **US-38** — As an Admin, I want to click a member to drill down into their full entry list with descriptions, so that I can review what they actually did.
- **US-39** — As an Admin, I want to see which members had **zero entries** in the selected period, so that I can follow up on missed tracking.
- **US-40** — As an Admin, I want a daily breakdown stacked by client (or by user), so that I can see how time is distributed across a week or month.
- **US-41** — As an Admin, I want to filter the reports page by any combination of date / client / project / member / tag / description text, so that I can answer ad-hoc questions from finance or clients.
- **US-42** — As an Admin, I want to export any filtered view to CSV, XLSX, or PDF, so that I can hand data off to systems and humans that don't have access to the app.
- **US-43** — As a User, I want to filter and export my own entries, so that I can produce a personal timesheet without bothering an Admin.

### 13.7 Audit & trash

- **US-44** — As an Admin, I want a firm-wide audit log filterable by actor, action, entity, and date, so that I can investigate "who changed what and when" without asking around.
- **US-45** — As an Admin, I want each entry to expose its own change history inline, so that I don't need to context-switch to the audit log for one record.
- **US-46** — As an Admin, I want to view the trash, restore individual entries, or purge them permanently, so that I can recover from accidents and also clean up when I'm sure.
- **US-47** — As any user, I want soft-deleted entries to be gone from normal views and reports, so that deleted data doesn't leak into my totals.

### 13.8 Settings

- **US-48** — As a User, I want to change my password and re-enroll 2FA from settings, so that I can keep my account secure over time.
- **US-49** — As a User, I want to leave a company I no longer belong to, so that my switcher stays clean.
- **US-50** — As an Admin, I want to be warned (and blocked) if I'm the **only** Admin and try to leave or demote myself, so that the company isn't left without an Admin.

---

## 14. Testing strategy

### 14.1 Goals

- Every user story in §13 maps to at least one automated test that fails if the story breaks.
- Multi-tenant isolation is verified for every endpoint — no test counts as "done" without a paired negative case from another company.
- Real-time sync, offline queue, and auth flows get dedicated suites because they fail silently otherwise.
- Full unit + integration suite runs in under 5 minutes locally and on CI.

### 14.2 Test pyramid

For a multi-tenant app the integration layer matters most — that's where permission bugs hide. Target distribution:

- **Unit (~50%)** — pure logic: duration calcs, role checks, validators, audit-diff builders, offline-queue conflict resolution.
- **Integration (~35%)** — API routes hit a real test Postgres, exercise auth + permissions + DB writes.
- **E2E (~15%)** — Playwright across critical flows in a real browser (web) and a packed extension.

### 14.3 Tools

| Layer | Tool | Notes |
|-------|------|-------|
| Unit / integration | Vitest | Native TS, fast watch mode |
| API integration | Vitest + fetch against test server | Real Postgres via testcontainers-node |
| E2E web | Playwright | Headless Chromium |
| E2E extension | Playwright with `--load-extension` | Real popup, headed in CI for traces |
| SMTP mocking | MailHog | Captures magic-link emails for assertion |
| TOTP in tests | `otplib` | Generate codes from known secret |
| Time control | Vitest fake timers | For period-based queries (today/week/month) |
| HTTP mocking (rare) | MSW | Only for outbound third-party calls if any |

### 14.4 Test database

- Separate Postgres DB, name suffixed `_test`, recreated by testcontainers per CI run.
- Each test runs inside a transaction that rolls back at teardown — zero shared state between tests.
- Deterministic seed fixture: 2 companies, 1 cross-company user (Admin in A, User in B), 2 single-company users, clients/projects/tags/entries on known dates.

### 14.5 Traceability

- Test names embed the US ID: `it('US-21: starts a second timer while one is already running')`.
- A coverage script `pnpm test:trace` greps test files and reports any US IDs from §13 with zero matching tests. CI fails if coverage drops below 100% of US.

### 14.6 Critical test areas

#### Multi-tenant isolation
For every read endpoint and every mutation, a paired test where a member of Company B attempts the same action on Company A's data must return **404** (not 403 — avoids existence leaks).

#### Permissions
Per endpoint, an `it.each` matrix over (role × action): admin, user, anonymous, cross-company. Each cell asserts the spec'd outcome.

#### Auth flows
- Email + password — happy path and wrong-password lockout.
- Magic link — generate, redeem, redeem twice (fail), redeem after expiry (fail).
- TOTP — enable via QR-derived secret, log in with valid/invalid codes, recovery code is single-use.
- Sessions — 30-day sliding renewal, logout invalidates server-side.

#### Time tracking
- Timer start/stop, multiple parallel timers per user, can't stop someone else's timer.
- Manual entries — past dates allowed, `end < start` rejected, future dates rejected.
- Edits produce exactly one audit row with correct before/after.
- Soft delete removes from normal queries, appears in trash, restore works, 30-day purge job actually purges.

#### Audit log
- Every mutation in a curated allowlist produces exactly one audit row (no missed, no duplicated).
- Audit rows are immutable — any direct mutation through the API fails.

#### Real-time sync
- Two WebSocket clients of the same user: action in one propagates to the other within 1s.
- Admin in same company sees a user's new entry within 1s.
- Users in different companies: zero crosstalk (assertion: zero events received over a 3s window).

#### Offline queue (extension)
- Queue accepts mutations while disconnected.
- On reconnect, mutations replay in order.
- Server has newer version → last-write-wins, conflict surfaced to user.
- Browser kill mid-replay → queue persisted in `chrome.storage.local`, resumes on next open.

#### Reports & exports
- Filter combinations produce the same row counts as a hand-rolled SQL ground truth.
- CSV/XLSX exports — header + row-count + spot-check on values.
- PDF export — header + row count, no pixel diff.
- Period selectors (today / week / month / custom) honor Europe/Prague boundaries (test around DST transitions).

#### Dashboard
- Each widget query matches a hand-rolled SQL ground truth on the seed.
- "Inactive users" returns members with zero non-deleted entries in the period.

#### Cascading delete prompt
- Delete client with linked entries: both branches tested (keep entries vs. cascade-delete entries).

### 14.7 What NOT to test

- Third-party library internals (Prisma, Auth.js).
- Exact pixel layout — visual regression is opt-in for the dashboard only, manual run before release.
- Email HTML rendering — assert subject and link presence, not full markup.

---

### 14.8 Instructions for AI agents (Claude Code)

This section is normative for any AI-assisted work on this codebase.

**Workflow per change:**

1. **Read first.** Before writing code, read the relevant US in §13 and the existing test for it. If there's no test, that's the first thing to add.
2. **Write the test before the implementation** when behavior is new or changing. The test must fail for the right reason before you make it pass.
3. **Edit-loop = focused tests only:** `pnpm test path/to/file --watch`. Do not run the full suite on every save.
4. **Before declaring done:** run the full unit + integration suite (`pnpm test`). Never skip on the assumption that "my change was small."
5. **E2E runs when touching:** auth flows, real-time sync, extension code, or routing. Command: `pnpm test:e2e`.
6. **Never commit with `.only`, `.skip`, or commented-out tests.** Pre-commit hook enforces this.
7. **For every new mutating endpoint:** add an audit-log assertion in the test. Mutation without audit row = bug, full stop.
8. **For every new read endpoint or mutation:** add the cross-company 404 test. Pattern: same request, different company's user, expect 404.

**Verifying that tests are actually doing work:**

- After making a change, confirm the test would have failed before it. Quick check: `git stash && pnpm test -- <file>; git stash pop`. If it still passes pre-change, the test isn't asserting what you think.
- If a test is flaky, do not retry until green — fix the source. Usual causes: missing `await`, time assertions without fake timers, WebSocket races without explicit `waitFor`/`expect.poll`.
- `expect.toHaveBeenCalledWith(expect.anything())` is not an assertion. Be specific or delete the line.

**Things AI must not do:**

- Do not delete or weaken existing tests to make a change pass. If a test is wrong, fix it in a separate, explicit commit with a justification in the message.
- Do not mock the database. Tests run against real Postgres via testcontainers. If something's hard to test without mocks, the design is probably wrong — surface it.
- Do not introduce `setTimeout` for synchronization in tests. Use `expect.poll`, `waitFor`, or fake timers.
- Do not stub `Date.now()` ad hoc. Use the shared time helper so all time-based tests stay consistent.
- Do not bundle multiple US into one test case. One US per `it`, US ID in the name.

**Things AI cannot fully automate** — call these out explicitly in the PR description when relevant:

- Chrome extension popup visual layout — needs a real Chrome + screenshot.
- Real SMTP delivery — tests use MailHog; staging release should be hand-verified once.
- TOTP enrollment with a real authenticator app (Google Authenticator, Authy, 1Password) — verified once on staging.
- Real-time sync timing under throttled network — automated test covers logic, not perceived UX latency.

**Required test scripts in `package.json`:**

```
pnpm test            # vitest unit + integration (default)
pnpm test:trace      # US-coverage trace, fails if any US has zero tests
pnpm test:e2e        # playwright web
pnpm test:e2e:ext    # playwright extension (loads packed extension)
pnpm test:all        # everything; CI default
```

### 14.9 CI gates

A PR is only mergeable when:

- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test:all` passes.
- `pnpm test:trace` reports 100% US coverage.
- No `.only` / `.skip` / `xit` / `xdescribe` in the diff.
- Migrations (if any) have been applied successfully against an ephemeral DB in CI.

---

## 15. Open questions for later

- Should there be a per-user setting for "default client/project" to pre-fill the timer?
- Should the dashboard support comparing two periods (this month vs. last month)?
- Recurring/scheduled time entries (e.g., daily standup auto-logged)? — likely a v2 feature.
- API for third-party integrations? — not in scope for v1, but data model should not block it.

---

## 16. Acceptance criteria (v1 done)

- [ ] User can be invited, register via invite link, and log in with email + password + optional TOTP.
- [ ] User can create a company, invite others, assign Admin/User roles.
- [ ] User can be a member of multiple companies and switch between them.
- [ ] Admin can CRUD clients, projects, and tags within a company.
- [ ] User can start/stop multiple parallel timers and create manual entries.
- [ ] All entries support edit and soft delete; trash restores within 30 days.
- [ ] Audit log captures all mutations with before/after snapshots.
- [ ] Admin dashboard renders all six widgets with working period selector.
- [ ] Reports page supports all filters and exports CSV/XLSX/PDF.
- [ ] Chrome extension supports login, multiple parallel timers, weekly view, edit/delete, real-time sync with web, and offline queue.
- [ ] Deployed via Coolify with Postgres, SMTP, and HTTPS via Traefik.
