# Build prompt — Self-Hosted Time Tracker

You are Claude Code. Your job is to take the attached PRD (`PRD-time-tracker.md`) and turn it into a working, deployed v1 of the application. Operate autonomously: make decisions, write tests, write code, run tests, commit, move on. Do **not** ask for confirmation between phases. The PRD is the source of truth — when this prompt and the PRD disagree, the PRD wins.

---

## 1. Mission

Build a self-hosted, multi-tenant time tracker (web app + Chrome extension) per the PRD. "Working v1" means every item in PRD §16 *Acceptance criteria* is satisfied, all tests in PRD §14 pass, and the app deploys successfully to Coolify via the included `docker-compose.yml`.

---

## 2. Inputs and environment

- **PRD location:** `./PRD-time-tracker.md` at the repo root. Read it fully before writing any code.
- **Working directory:** the repo root. Do not write outside it.
- **Target deployment:** Coolify on Debian VPS, Postgres 16, SMTP already configured at the platform level.
- **Browser target:** Chromium (extension tested in headless Chromium via Playwright).
- **Locale:** Czech (`cs-CZ`), timezone `Europe/Prague`.

---

## 3. Operating principles

1. **Autonomous.** Don't pause to ask. If the PRD is silent on a detail, decide using the principle "smallest change that satisfies the spec," document the decision in `DECISIONS.md`, and continue.
2. **Test-first.** For every user story (US-1 through US-50 in PRD §13), write the test before the implementation. The test must fail for the right reason before you make it pass.
3. **Run tests constantly.** After every meaningful change, run the focused test for the file you touched. After every phase, run the full suite. Never commit red.
4. **Commit small, commit often.** One logical change per commit. Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Reference US IDs in commit body when relevant.
5. **No mocks for the database.** Use real Postgres via testcontainers-node. If something is hard to test without mocking the DB, the design is probably wrong — fix the design.
6. **Multi-tenant isolation is non-negotiable.** Every read endpoint and every mutation gets a paired cross-company test that returns 404 for outsiders. No exceptions.
7. **Audit everything mutating.** Every mutation produces exactly one audit row. Tests assert this.
8. **Stay in scope.** v1 only. If you find yourself building something not in the acceptance criteria and not required by an in-scope feature, stop and remove it.

---

## 4. Tech stack (locked)

These are not suggestions. Use exactly these unless a hard blocker emerges, in which case document the blocker in `DECISIONS.md` and pick the closest alternative.

- **Package manager:** pnpm.
- **Monorepo:** pnpm workspaces (`apps/web`, `apps/ws`, `apps/extension`, `packages/db`, `packages/ui`, `packages/shared`).
- **Web app:** Next.js 15 (App Router), React 19, TypeScript strict, Tailwind, shadcn/ui.
- **API:** Next.js route handlers + tRPC.
- **Database:** PostgreSQL 16 via Prisma.
- **Auth:** Auth.js (NextAuth) — credentials + email magic link providers; custom TOTP layer using `otplib`.
- **Real-time:** WebSockets in `apps/ws` using `ws`. Redis as pub/sub between Next.js and the WS service.
- **Email:** `nodemailer` against platform SMTP. Locally, MailHog via docker-compose.
- **Background jobs:** `node-cron` inside the web app (daily trash purge, expired invite cleanup).
- **Extension:** Vite + React + TypeScript, Manifest V3. Shares `packages/ui` and `packages/shared` with the web app.
- **Testing:** Vitest (unit + integration), Playwright (E2E web + extension), testcontainers-node (Postgres + Redis), MailHog (email assertions).
- **Lint/format:** ESLint, Prettier, `lint-staged` + Husky pre-commit hook blocking `.only` / `.skip` / `xit` / `xdescribe`.
- **CI:** `.github/workflows/ci.yml` running lint → typecheck → test → e2e → build.

---

## 5. Repository layout

Create exactly this layout. Don't add top-level dirs without need.

```
.
├── PRD-time-tracker.md          # source of truth
├── BUILD-PROMPT.md              # this file
├── DECISIONS.md                 # log of every autonomous decision
├── PROGRESS.md                  # phase-by-phase status log
├── README.md                    # how to run + deploy
├── docker-compose.yml           # Coolify-deployable
├── docker-compose.dev.yml       # local dev (Postgres + Redis + MailHog)
├── .github/workflows/ci.yml
├── apps/
│   ├── web/                     # Next.js
│   ├── ws/                      # WebSocket server
│   └── extension/               # Chrome MV3
├── packages/
│   ├── db/                      # Prisma schema + client
│   ├── shared/                  # types, validators (zod), helpers
│   └── ui/                      # shadcn components shared by web + popup
└── pnpm-workspace.yaml
```

---

## 6. Phased build plan

Execute phases in order. Do not start phase N+1 until phase N is green: all tests pass, all commits made, `PROGRESS.md` updated.

### Phase 0 — Repository bootstrap
- Init git, pnpm workspaces, TypeScript with `"strict": true` everywhere.
- Configure ESLint (with `@typescript-eslint`, `eslint-plugin-react`, no-only rule), Prettier, Husky, lint-staged.
- Add root scripts: `test`, `test:trace`, `test:e2e`, `test:e2e:ext`, `test:all`, `lint`, `typecheck`, `build`.
- Add `docker-compose.dev.yml` with Postgres 16, Redis 7, MailHog. Verify it boots cleanly.
- Add `.github/workflows/ci.yml` running the full pipeline against ephemeral services.
- Commit: `chore: bootstrap monorepo and tooling`.

### Phase 1 — Database schema
- In `packages/db`, define the Prisma schema matching PRD §3.1 exactly. Include all entities, indexes, and constraints.
- Add a deterministic seed matching PRD §14.4.
- Add a testcontainers helper that boots Postgres, runs migrations, returns a Prisma client. All integration tests use this.
- Add a transactional rollback helper so each test runs in its own transaction and rolls back at teardown.
- Tests: schema constraints (unique membership, cascade rules at the DB level where applicable).
- Commit: `feat(db): initial schema and test harness`.

### Phase 2 — Auth
Implement in this order, test-first per sub-step:
1. Email + password signup (only via invite token; no public signup) and login.
2. Magic link issue + redeem (single-use, 15-min expiry).
3. TOTP enrollment, verification, recovery codes (single-use).
4. Sessions (30-day sliding renewal, server-side invalidation on logout).
5. Rate limit on password attempts (lockout after N).

Cover US-1 through US-5. Commit per sub-step.

### Phase 3 — Companies, memberships, invites
- CRUD for companies, switch endpoint, multi-membership.
- Invite create/revoke/resend, accept flow (US-1, US-2, US-8, US-9).
- Role management with the "last admin" guard (US-50).
- Member removal preserving entries under their name (US-11).
- Tests: cross-company 404 matrix on every endpoint.
- Commit per sub-step.

### Phase 4 — Clients, projects, tags
- Admin CRUD for clients, projects, tags. Archive flag.
- User read-only view; inline tag creation by users (US-17).
- Cascading delete prompt at API level: route accepts `cascade: boolean`. UI handles the prompt.
- Tests: permission matrix per endpoint, archive vs. delete behavior, cascade vs. orphan branches (US-15).
- Commit per entity.

### Phase 5 — Time entries
- Start/stop timer (multiple parallel per user — US-21).
- Manual entry with validation (`end > start`, no future, any past date allowed).
- Edit own / edit any-as-admin, soft delete, trash, restore, 30-day purge cron job.
- Inline change history endpoint per entry (US-27, US-45).
- Tests: cover US-19 through US-28; every mutation produces exactly one audit row.
- Commit per sub-feature.

### Phase 6 — Audit log
- Cross-cutting: implement an audit-writing wrapper that every mutation route uses. Add a test that fails if a mutation route doesn't call it.
- `/audit` endpoint with filters (actor, action, entity, date range).
- Per-entry inline history endpoint.
- Tests: assert audit immutability (any mutation API on audit rows returns 405/403).
- Commit: `feat(audit): firm-wide log and per-entry history`.

### Phase 7 — Real-time sync
- `apps/ws` service: authenticates via session cookie, subscribes clients to `user:{id}` and `company:{id}` channels.
- Mutation routes publish events to Redis; WS service forwards to subscribed clients.
- Client hook in `packages/shared` for both web and extension.
- Tests: two WS clients of same user receive each other's events within 1s; cross-company assertion that zero events leak over a 3s window (US-31).
- Commit: `feat(ws): real-time sync via redis pub/sub`.

### Phase 8 — Web UI
Build the pages from PRD §6.1 in this order, each with a Playwright E2E covering the relevant US:
1. `/login`, `/invite/:token`, `/settings`.
2. `/companies` switcher.
3. `/timer` — start/stop, parallel timers, today's list.
4. `/timesheet` — week view with edit.
5. `/clients`, `/tags`.
6. `/members` — invites + role management.
7. `/dashboard` — six widgets per PRD §7. Period selector tested across DST boundary.
8. `/reports` — full filter matrix + CSV/XLSX/PDF exports. Verify exports against ground-truth SQL.
9. `/audit`, `/trash`.

UI is in Czech. Use `next-intl` with a single `cs.json` locale file. No English strings in the UI.

Commit per page.

### Phase 9 — Chrome extension
- MV3 manifest, popup built with Vite + React, sharing `packages/ui` and `packages/shared`.
- Login (email/password + TOTP, magic link) inside the popup. Session token in `chrome.storage.local`.
- Popup mirrors the Clockify-style layout from the user's reference: company switcher, quick-start row, parallel running timers, "This week" grouped by day, ⋯ menu per entry, "Play again" button.
- Real-time sync via WS.
- Offline queue:
  - Mutations while disconnected go to a persisted queue in `chrome.storage.local`.
  - On reconnect, replay in order. Server is authoritative; conflicts surface a non-blocking toast.
  - Visual indicator for unsynced state.
- Playwright with `--load-extension` covers US-29 through US-35.
- Commit per sub-feature.

### Phase 10 — Deployment
- `docker-compose.yml` for Coolify with services: `web`, `ws`, `postgres`, `redis`. Use `expose` (not `ports`) so Coolify's Traefik routes internally — this matches a known Coolify gotcha where bound ports collide with Traefik.
- Healthcheck endpoint at `/api/health` returning DB + Redis status.
- Daily Postgres dump cron defined in compose (separate `db-backup` service).
- Backup destination configurable via env var.
- Document Coolify deployment in `README.md` including required env vars.
- Smoke test: bring the stack up via `docker compose up`, run a Playwright smoke against the live containers.
- Commit: `feat(deploy): coolify-ready compose and healthcheck`.

### Phase 11 — Polish and verify acceptance
- Run `pnpm test:trace` — must report 100% US coverage.
- Run `pnpm test:all` — must be green.
- Walk PRD §16 acceptance checklist; tick each item with a reference to the test that proves it.
- Update `README.md`: local dev setup, test commands, deploy notes, env var reference.
- Update `PROGRESS.md` with final status.
- Final commit: `chore: v1 complete`.

---

## 7. Per-phase loop

Inside every phase, repeat this loop until the phase is done:

1. Pick the next user story or sub-task.
2. Write a failing test that names the US ID: `it('US-21: starts a second timer while one is already running')`.
3. Run the test. Confirm it fails for the *right* reason.
4. Implement the smallest change that makes it pass.
5. Re-run the focused test until green.
6. Run `pnpm typecheck` and `pnpm lint` for the workspace you touched.
7. If you added a mutation route: confirm there's a paired audit-log assertion and a paired cross-company 404 test. If missing, add them now.
8. Commit.
9. After every ~5 commits or at the end of a phase, run `pnpm test:all`. Fix any breakage before continuing.

---

## 8. Quality gates per commit

Pre-commit hook enforces:
- ESLint passes.
- Prettier formatted.
- No `.only` / `.skip` / `xit` / `xdescribe`.
- No `console.log` in `apps/` or `packages/` (allowed in scripts).

CI gate (must pass before a phase counts as done):
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:all`
- `pnpm test:trace` reports 100% US coverage for stories implemented up to this phase.

---

## 9. Handling ambiguity and blockers

- **PRD is silent or unclear** → make the smallest, most reversible decision that satisfies the surrounding spec. Log in `DECISIONS.md` with: date, the question, the decision, the reasoning.
- **Test reveals a spec contradiction** → record in `DECISIONS.md`, pick the interpretation that better preserves multi-tenant safety, continue.
- **A library can't do what's needed** → swap to the closest alternative, log in `DECISIONS.md`, continue. Don't redesign the architecture.
- **A real blocker** (e.g., environmental, missing credential, ambiguity that affects many features) → write `BLOCKED.md` with a precise question and a proposed default. Continue with the proposed default. Don't stop.

Never stop and wait. Always make forward progress.

---

## 10. Progress tracking

Maintain `PROGRESS.md` at the repo root. Append-only log, one entry per phase:

```
## Phase 5 — Time entries
- Started: 2026-05-03 14:20
- US covered: 19, 20, 21, 22, 23, 24, 25, 26, 27, 28
- Commits: a1b2c3d..f4e5d6c
- Notes: cron purge runs at 03:00 UTC; tested with fake timers.
- Finished: 2026-05-03 18:05
```

Maintain `DECISIONS.md` similarly:

```
## 2026-05-03 — Magic link expiry on second redeem
PRD says single-use; doesn't say what status code to return on second redeem.
Decision: 410 Gone. Reasoning: matches semantic "resource existed but is gone."
```

---

## 11. Anti-patterns — do not do these

- Asking the user to choose between options. Decide and document.
- Writing tests after the implementation "to save time."
- Mocking the database, the WebSocket layer, or the audit logger.
- Using `setTimeout` to wait for async behavior in tests. Use `expect.poll` / `waitFor` / fake timers.
- Stubbing `Date.now()` ad hoc. Use a single shared time helper.
- Suppressing or weakening a test to make a change pass. If a test is wrong, fix it in a separate, explicit commit with justification.
- Bundling multiple US into one `it`. One US per test.
- Adding features not in the PRD acceptance criteria.
- Using English strings in the UI. Czech only.
- Binding host ports `80`/`443` in `docker-compose.yml`. Use `expose`.
- Committing red. Committing with `.only` / `.skip`. Committing without running the focused test.

---

## 12. Done definition

v1 is complete when **all** of the following are true:

- [ ] `pnpm test:all` is green locally and on CI.
- [ ] `pnpm test:trace` reports 100% coverage of US-1 through US-50.
- [ ] `pnpm lint` and `pnpm typecheck` are clean across all workspaces.
- [ ] Every checkbox in PRD §16 is ticked, with a comment in `PROGRESS.md` linking each criterion to the test file that proves it.
- [ ] `docker compose -f docker-compose.yml up` brings the full stack up with no errors against a fresh volume.
- [ ] `/api/health` returns 200 with DB + Redis healthy.
- [ ] Playwright smoke against the docker-compose stack passes.
- [ ] `README.md` covers: local dev, test commands, deploy to Coolify, env var reference.
- [ ] `PROGRESS.md` has a final entry: `Phase 11 — v1 complete`.

When all of the above are true, commit `chore: v1 complete` and stop. Do not start v2 work.
