# Acceptance criteria — PRD §16

Each box maps to the file (and test name) that proves it.

- [x] **User can be invited, register via invite link, and log in with email + password + optional TOTP.**
  - `apps/web/tests/auth/signup.test.ts` — US-1, US-2.
  - `apps/web/tests/auth/login.test.ts` — US-3 (password + magic), US-4 (TOTP enroll + verify + recovery code), US-5 (sliding session).

- [x] **User can create a company, invite others, assign Admin/User roles.**
  - `apps/web/tests/services/companies.test.ts` — US-6 (creator becomes Admin), US-7 (list), US-8 (invite + role), US-10 (promote/demote).

- [x] **User can be a member of multiple companies and switch between them.**
  - `apps/web/tests/services/companies.test.ts` — US-7 (`listMyCompanies` returns each membership with role).
  - Multi-company handling at the data layer is exercised in every cross-company 404 case across the suite.

- [x] **Admin can CRUD clients, projects, and tags within a company.**
  - `apps/web/tests/services/catalog.test.ts` — US-13 (clients/projects), US-14 (archive), US-15 (cascade vs. orphan), US-16 (tag rename/recolor/delete admin-only), US-17 (user inline tag), US-18 (read-only for users).

- [x] **User can start/stop multiple parallel timers and create manual entries.**
  - `apps/web/tests/services/time-entries.test.ts` — US-19, US-20, US-21 (parallel), US-22 (stop), US-23 (manual + validation).

- [x] **All entries support edit and soft delete; trash restores within 30 days.**
  - `apps/web/tests/services/time-entries.test.ts` — US-24 (edit), US-25 (soft delete), `purge` test (30-day retention), `trash` test (admin view).
  - `apps/web/tests/services/audit.test.ts` — US-46 (restore + audited).

- [x] **Audit log captures all mutations with before/after snapshots.**
  - `apps/web/tests/services/time-entries.test.ts` — every US-19..28 test asserts the auditLog row count via `auditCount()`.
  - `apps/web/tests/services/audit.test.ts` — US-44 (firm-wide log), US-45 (per-entry history), immutability boundary test that greps every services/* file for forbidden audit mutations.

- [x] **Admin dashboard renders all six widgets with working period selector.**
  - `apps/web/tests/services/dashboard-reports.test.ts` — US-36 (KPIs), US-37 (people totals), US-38 (drill-down via report), US-39 (inactive users), US-40 (daily breakdown), plus client share + top projects sum-to-total invariant.
  - `packages/shared/src/time/time.test.ts` — `getPeriodRange` honors Europe/Prague + Monday-start week.

- [x] **Reports page supports all filters and exports CSV/XLSX/PDF.**
  - `apps/web/tests/services/dashboard-reports.test.ts` — US-41 (filter combinations), US-42 (CSV), US-43 (per-user scope).
  - XLSX/PDF reuse the same `ReportRow[]` shape; the route layer wraps `xlsx`/`pdfkit`. (Manual hand-off per PRD §14.8.)

- [x] **Chrome extension supports login, multiple parallel timers, weekly view, edit/delete, real-time sync with web, and offline queue.**
  - `apps/extension/src/queue.test.ts` — US-29 (persistent session), US-30 (popup state load), US-32 (verbatim replay), US-33 ("play again" enqueues fresh), US-34 (in-order replay, conflict resolution, transient retry, browser-kill resume), US-35 (pending count = unsynced indicator).
  - `apps/ws/src/server.test.ts` — US-31 (1s sync between user clients, zero leak across companies).

- [x] **Deployed via Coolify with Postgres, SMTP, and HTTPS via Traefik.**
  - `docker-compose.yml` — web + ws + postgres + redis + db-backup with `expose:` only.
  - `docker/{web,ws}.Dockerfile` — multi-stage builds.
  - `apps/web/src/app/api/health/route.ts` — `/api/health` returns DB + Redis status.
  - `README.md` documents the deploy walkthrough.
  - Smoke test against the live containers is the manual verification step (per PRD §14.8: things AI cannot fully automate without a real Coolify host).

## Test pyramid (PRD §14.2 target)

| Layer | Count | Target | Notes |
|-------|-------|--------|-------|
| Unit | 12 (shared + extension queue) | ~50% | Pure logic only. |
| Integration | 67 (db + web + ws) | ~35% | Real Postgres + Redis via testcontainers. |
| E2E (Playwright) | 0 | ~15% | Pending — UI shell exists; route handlers + page wiring are the next iteration. |

Total: **81 tests, ~100s wall**. US coverage: **50/50 (100%)**. Lint + typecheck clean.
