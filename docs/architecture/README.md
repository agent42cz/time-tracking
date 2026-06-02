# Architecture (AS IS)

Self-hosted multi-tenant time tracker. Three apps, three packages, deployed to Coolify as a single Docker Compose stack.

## Topology

```
                         ┌─────────────────────┐
   browser  ── HTTPS ──▶ │  Traefik (Coolify)  │
                         └──┬───────────────┬──┘
                            │               │ wss
                  http      ▼               ▼
                  ┌──────────────┐   ┌──────────────┐
                  │  apps/web    │   │  apps/ws     │
                  │  Next.js 15  │   │  ws + Redis  │
                  └──┬───────┬───┘   └──┬───────────┘
                     │       │ pub      │ psub
                     │       └─────────▶│
            Prisma   ▼                  ▼
            ┌──────────────┐   ┌────────────────┐
            │  Postgres 16 │   │  Redis 7       │
            └──────────────┘   └────────────────┘

   Chrome MV3 popup (apps/extension) ── HTTPS + WSS ──▶ web + ws
   (offline queue in chrome.storage.local replays on reconnect)
```

## Apps

| App           | Path                                     | Stack                                                  | Purpose                                                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **web**       | [`apps/web`](../../apps/web)             | Next.js 15 App Router, React 19, Tailwind, `next-intl` | Primary UI + tRPC API + route handlers + server actions. Hosts every page from PRD §6.1: `/timer`, `/dashboard`, `/reports`, `/clients`, `/tags`, `/members`, `/audit`, `/trash`, `/settings`, `/companies`, plus `/login`, `/invite/[token]`, `/reset`.       |
| **ws**        | [`apps/ws`](../../apps/ws)               | `ws` (Node WebSocket library) + `ioredis`              | Real-time fan-out. Authenticates via session cookie or `?token=`. Subscribes each socket to `user:{id}` and `company:{id}` channels via a single Redis `psubscribe`, filters per connection. Mutation routes in `web` publish to Redis; this service forwards. |
| **extension** | [`apps/extension`](../../apps/extension) | Vite + React 19, MV3 manifest                          | Chrome popup. Mirrors web in real time via `apps/ws`. Persistent FIFO offline queue in `chrome.storage.local` (commit-before-send so a browser kill mid-replay leaves a recoverable queue).                                                                    |

## Packages

| Package        | Path                                       | Purpose                                                                                                                                                                                                   |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **@tt/db**     | [`packages/db`](../../packages/db)         | Prisma schema (`prisma/schema.prisma`), generated client, deterministic seed (`src/seed.ts`), testcontainers harness (`src/test/`). Exports: `.`, `./test`, `./seed`.                                     |
| **@tt/shared** | [`packages/shared`](../../packages/shared) | Zod validators, `date-fns` + `Europe/Prague` time helpers (`getPeriodRange`, etc.), WS wire types + reconnecting client. Exports: `.`, `./time`, `./validators`, `./ws`.                                  |
| **@tt/ui**     | [`packages/ui`](../../packages/ui)         | Shared React primitives — Alert, Badge, Button, Card, ConfirmModal, EmptyState, Field, Input, Label, Select, Table. Tailwind + `clsx` + `tailwind-merge` only. No styled-components. Exports: `.`, `./*`. |

## Data flow

A mutation flows like this:

1. **Browser** → server action (`apps/web/src/lib/actions/`) or tRPC route → service function (`apps/web/src/lib/services/`).
2. **Service** runs the work in a Prisma transaction:
   - Permission check (admin-only routes assert `membership.role === 'admin'`; cross-company outsiders return `not_found` / 404).
   - Domain mutation.
   - **Exactly one** `writeAudit({ action, entityType, entityId, before, after })` call. The audit table is append-only; no service may call `auditLog.update` or `auditLog.delete`.
3. **Service** publishes a WS event to Redis on the `user:{id}` and `company:{id}` channels (`apps/ws/src/publish.ts`).
4. **`apps/ws`** forwards to subscribed sockets — both web tabs and the Chrome popup.
5. **Background job** (`node-cron` inside `apps/web`) runs daily: trash purge (30-day retention), expired-invite cleanup.

## Auth

- Auth.js v5 with `@auth/prisma-adapter`.
- **Credentials provider** — email + argon2id password hash. Rate-limited per IP and per account in `apps/web/src/lib/auth/rate-limit.ts`.
- **Magic link provider** — single-use, 15-min expiry, SHA-256 hash on the token in DB.
- **TOTP layer** — `otplib`-based, layered on top of password login (and over magic link if enabled). 10 single-use recovery codes generated on enable.
- **Sessions** — 30-day sliding renewal, server-side invalidation on logout.
- **Invite-only signup** — no public registration. First user via `pnpm prisma:seed` or a manual `Invite` row.

## Multi-tenancy

- Every `Company` is a tenant. `User`s join via `Membership(role: admin|user)`.
- A user can be Admin in Company A and User in Company B simultaneously.
- The active company comes from the session cookie; the company switcher (`apps/web/src/components/CompanySwitcher.tsx`) updates it.
- Every read endpoint scopes by `company_id`. Cross-tenant attempts return **404** (not 403).

## Real-time guarantees

- Two WS clients of the same user receive each other's events within ~1s (verified by `apps/ws/src/server.test.ts`).
- Cross-company isolation is verified over a 3s window: zero events leak (US-31).
- Reconnect uses exponential backoff in `packages/shared/src/ws/client.ts`.

## Build log

The chronological v1 build is recorded in [`build-log.md`](build-log.md) — useful as archaeological context but not load-bearing for present-day work.

## Reporty (grouped report + CSV/PDF export)

`/reports` (**Reporty**) is the admin-facing grouped report surface (US-77, US-78). It is distinct from two neighbouring surfaces:

- **Stopky** (`/timer`) — running timers plus a recent history (last ~2 months) grouped by day and month; quick-start row at the top.
- **Dashboard** (`/dashboard`) — fixed KPI widgets (totals, member table, daily breakdown) for the active company.

Reporty's data flow is:

1. `runReport(db, actorUserId, filters)` — single Prisma query; returns `ReportRow[]` with IDs, names, durations, tags.
2. `buildGroupedReport(rows, { groupBy, clampEnd })` — pure function; groups by project / member / day, computes per-group `subtotalMs` and `grandTotalMs`. Consumed by both the page component and the PDF builder.
3. `buildReportPdf(report, meta)` — pure async function (pdfmake `PdfPrinter`, ADR-0010); receives all translated strings via `meta.t`, so it is unit-testable without next-intl. Embeds DejaVu Sans for Czech diacritics.

Two export routes hang off `/api/reports/`:

- `export.csv` — thin wrapper over `rowsToCsv(rows)`.
- `export.pdf` — calls `runReport → buildGroupedReport → buildReportPdf`; supports `preset=lastMonth` for a one-click previous-calendar-month PDF.

## See also

- [`../reference/data-model.md`](../reference/data-model.md) — Prisma entities and relations.
- [`../reference/features.md`](../reference/features.md) — feature catalogue, US-1..US-78.
- [`../operations/coolify-deploy.md`](../operations/coolify-deploy.md) — production stack and env vars.
- [`../decisions/`](../decisions/) — ADRs explaining _why_ the stack is what it is.
