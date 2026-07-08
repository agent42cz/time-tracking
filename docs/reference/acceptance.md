# Acceptance evidence — PRD §16

Each box maps to the file (and test name) that proves it. v1 was declared complete on 2026-05-03; this document is updated whenever a criterion changes (test moved, behavior extended) — but the criteria themselves do not change without a new ADR.

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
  - `apps/web/tests/services/time-entries.test.ts` — not every US-19..28 test asserts an audit row count. The file defines its own local `auditCount(tx, entryId)` helper (`time-entries.test.ts:63`, a third signature distinct from `catalog.test.ts:57` and `auto-stack-save.test.ts:68`), used by US-19, US-20, US-22 and one of the two US-24 tests; other tests in that range query `auditLog.findFirst()`/`findMany()` directly for row content (e.g. the US-24 note test, `US-59: ... forward source to audit`), and several (US-21, US-23, US-25, US-26, US-27, US-28) assert no audit row at all.
  - `apps/web/tests/services/audit.test.ts` — US-44 (firm-wide log), US-45 (per-entry history), immutability boundary test that greps every `services/*` file for forbidden audit mutations.

- [x] **Admin dashboard renders all six widgets with working period selector.**
  - `apps/web/tests/services/dashboard-reports.test.ts` — US-36 (KPIs), US-37 (people totals), US-38 (drill-down via report), US-39 (inactive users), US-40 (daily breakdown), plus client share + top projects sum-to-total invariant.
  - `packages/shared/src/time/time.test.ts` — `getPeriodRange` honors Europe/Prague + Monday-start week.

- [x] **Reports page supports all filters and exports CSV/XLSX/PDF.**
  - `apps/web/tests/services/dashboard-reports.test.ts` — US-41 (filter combinations), US-42 (CSV), US-43 (per-user scope).
  - PDF is done via pdfmake (ADR-0010): `apps/web/tests/services/report-pdf.test.ts` and `reports-export-pdf-route.test.ts` — US-78.
  - XLSX reuses the same `ReportRow[]` shape; route layer still pending.

- [x] **Reports group time entries by project/member/day with subtotals + grand total.**
  - `apps/web/tests/services/report-grouped.test.ts` — US-77.

- [x] **Reports export to PDF (incl. last-month preset), cross-company 404.**
  - `apps/web/tests/services/report-pdf.test.ts`, `apps/web/tests/services/reports-export-pdf-route.test.ts` — US-78.

- [x] **Reports Export dialog scopes exports to a chosen period + person(s); PDF/CSV; cross-company 404.**
  - `apps/web/tests/services/export-url.test.ts`, `apps/web/tests/services/date-presets.test.ts` — US-89 (URL + grouping + presets).
  - `apps/web/tests/services/reports-export-pdf-route.test.ts`, `apps/web/tests/services/reports-export-csv-route.test.ts` — US-89 (member-scoped export + cross-company 404).

- [x] **Chrome extension supports login, multiple parallel timers, weekly view, edit/delete, real-time sync with web, and offline queue.**
  - `apps/extension/src/queue.test.ts` — US-29 (persistent session), US-30 (popup state load), US-32 (verbatim replay), US-33 ("play again" enqueues fresh), US-34 (in-order replay, conflict resolution, transient retry, browser-kill resume), US-35 (pending count = unsynced indicator).
  - `apps/ws/src/server.test.ts` — US-31 (1s sync between user clients, zero leak across companies).

- [x] **Deployed via Coolify with Postgres, SMTP, and HTTPS via Traefik.**
  - `docker-compose.yml` — web + ws + postgres + redis + db-backup with `expose:` only.
  - `docker/{web,ws}.Dockerfile` — multi-stage builds.
  - `apps/web/src/app/api/health/route.ts` — `/api/health` returns DB + Redis status.
  - [`../operations/coolify-deploy.md`](../operations/coolify-deploy.md) — deploy walkthrough.
  - Smoke test against the live containers is the manual verification step.

## Test pyramid

| Layer            | Count                         | Target | Notes                                                                           |
| ---------------- | ----------------------------- | ------ | ------------------------------------------------------------------------------- |
| Unit             | 12 (shared + extension queue) | ~50%   | Pure logic only.                                                                |
| Integration      | 67 (db + web + ws)            | ~35%   | Real Postgres + Redis via testcontainers.                                       |
| E2E (Playwright) | 0                             | ~15%   | Pending — UI shell exists; route handlers + page wiring are the next iteration. |

Total at v1: **81 tests, ~100s wall**. US coverage: **50/50 (100%)**. Lint + typecheck clean.

- [x] **User can issue and revoke personal API tokens scoped to a single company.**
  - `apps/web/tests/services/api-tokens.test.ts` — US-55 (issue token, plaintext once, prefix on re-list), US-56 (list tokens, revoke is immediate).

- [x] **MCP tools list, start, stop, and update time entries over an authenticated HTTP channel.**
  - `apps/web/tests/server/mcp/list-running.test.ts` — US-57 (`list_running_entries` returns running entries, empty array when none).
  - `apps/web/tests/server/mcp/start-timer.test.ts` — US-58 (`start_timer` opens entry, broadcasts `timer.started`, leaves other timers alone).
  - `apps/web/tests/server/mcp/update-entry.test.ts` — US-59 (`update_entry` patches fields, audit row with `source = 'mcp'`).
  - `apps/web/tests/server/mcp/stop-timer.test.ts` — US-60 (`stop_timer` ends entry, broadcasts `timer.stopped`).

- [x] **MCP layer enforces cross-company isolation, revocation, and rate limiting.**
  - `apps/web/tests/server/mcp/auth.test.ts` — US-61 (cross-company entry returns `not_found`, no existence leak), US-62 (revoked token returns HTTP 401), US-63 (rate-limit returns HTTP 429 with `Retry-After`; next window allows).
