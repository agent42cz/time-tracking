# MCP server (US-55 … US-63)

**Status**: implemented
**Date**: 2026-05-15
**Owner**: misalenert@gmail.com

## Problem

A user wants to drive their time-tracking entries from inside a Claude Code (or Cursor, etc.) session: read currently running timers, append "what I just did and which commit" to a chosen entry's description, and optionally start/stop timers without leaving the terminal. The companion workflow on the LLM side already handles Plane (existing `mcp__plane` server) — closing the description in the tracker is the missing leg. A user may have multiple timers running concurrently (US-21), so every tool that targets an entry takes an explicit `entryId`.

There is no machine-friendly API today: the web app authenticates via Auth.js session cookies and the extension talks via the same session. Time to expose a multi-tenant, token-authenticated MCP endpoint so any user can plug their own Claude into their own data.

## User stories

These are appended to `docs/reference/features.md` and `tests/_helpers/trace.ts` raises its cap to **US-63**.

- **US-55** — A user issues a personal MCP token scoped to one company from `/settings/api-tokens`. Plaintext is shown exactly once; subsequent loads show only the prefix.
- **US-56** — A user lists and revokes their tokens; revocation is immediate.
- **US-57** — An MCP client calling `list_running_entries` with a valid token returns every currently running entry for that user/company as an array (possibly empty).
- **US-58** — `start_timer` opens an entry against optional `clientId`/`projectId`/`tagIds`; the WS layer publishes `timer.started` so any open browser/extension reflects the change. Other running entries (US-21) are left alone.
- **US-59** — `update_entry` with an explicit `entryId` replaces `description` and/or `clientId`/`projectId`/`billable`/`tagIds`; one audit row is written with `source = 'mcp'`.
- **US-60** — `stop_timer` with an explicit `entryId` ends that entry and broadcasts `timer.stopped`; other running entries continue.
- **US-61** — A token issued for Company A targeting Company B's `entryId` returns the MCP `not_found` error code (no existence leak).
- **US-62** — A revoked token returns HTTP `401` on every call (read or write).
- **US-63** — A token over the rate limit returns HTTP `429` with `Retry-After`; the next minute it succeeds again.

## Out of scope

- OAuth 2.1 with dynamic client registration. Revisit if a non-bearer client appears.
- Stdio binary / `npx @tt/mcp` wrapper. Revisit only if a target client lacks remote MCP support.
- Tool scopes / read-only tokens. Add a `scopes` column when there is a real need.
- `delete_entry` and bulk operations. Destructive actions stay in the UI.
- Server-initiated push (the `GET /api/mcp` SSE half of streamable HTTP). Endpoint returns `405` for `GET`.
- Org-admin tokens. Token is always `(userId, companyId)` and inherits the user's role.
- A separate `apps/mcp` service. Reconsider if MCP load becomes comparable to web load.
- Czech localisation of MCP error/tool messages — those are LLM-facing English; only the settings UI is Czech.

## Architecture

Single route handler in `apps/web` reusing the existing service layer. No new app process, no new infrastructure.

```
Claude Code (or Cursor / etc.)
    │  HTTP, Authorization: Bearer tt_pat_<token>
    ▼
apps/web  ── POST /api/mcp ──────────┐
                                      │  @modelcontextprotocol/sdk
                                      │  StreamableHTTPServerTransport (stateless)
                                      ▼
                  src/server/mcp/authenticate.ts
                                      │
                                      ▼  { userId, companyId, tokenId }
                  src/server/mcp/router.ts  ◄── new McpServer per request
                                      │
                                      ▼
                  src/server/mcp/tools/*.ts  (thin wrappers; no business logic)
                                      │
                                      ▼
                  apps/web/src/lib/services/*  (unchanged)
                                      │
                                      ├─► Postgres (Prisma)
                                      ├─► AuditLog row (every mutation, source=mcp)
                                      └─► publishTimeEntry(...) → Redis → ws → browser/ext
```

### Files added

- `apps/web/src/app/api/mcp/route.ts` — `POST` handler; `GET` returns `405`.
- `apps/web/src/server/mcp/authenticate.ts` — bearer parsing, token lookup, rate-limit check, returns `McpAuthContext` or a `Response`.
- `apps/web/src/server/mcp/router.ts` — builds a fresh `McpServer` per request, registers all tools.
- `apps/web/src/server/mcp/tools/` — one file per tool plus an `index.ts` that wires them in.
- `apps/web/src/server/mcp/errors.ts` — domain-error → MCP-error mapping (`not_found`, `invalid_args`, `conflict`, `internal`).
- `apps/web/src/server/mcp/DESCRIPTION.md` — purpose, public surface, deps, used-by, notes.
- `apps/web/src/lib/services/api-tokens.ts` — `issueToken`, `verifyToken`, `revokeToken`, `listTokens`, `touchLastUsed`.
- `apps/web/src/lib/actions/api-tokens.ts` — server actions for the settings page.
- `apps/web/src/app/(authenticated)/settings/api-tokens/page.tsx` + child components.
- `docs/operations/mcp-server.md` — ops-flavoured English doc with endpoint URL, header format, example Claude Code config snippet, and the example skill loop.
- `docs/decisions/00XX-mcp-server.md` — ADR per constitution §1 (adding `@modelcontextprotocol/sdk` to the locked stack).
- `packages/db/prisma/migrations/<ts>_add_api_tokens/migration.sql` — additive.

### Files modified

- `packages/db/prisma/schema.prisma` — add `ApiToken` model; add `source` enum + column to `AuditLog`.
- `apps/web/src/lib/services/audit.ts` — accept optional `source` (defaults to `'web'`); existing call sites unchanged.
- `apps/web/src/lib/services/time-entries.ts`, `catalog.ts`, etc. — accept `source` in the audit-write call. Tests cover that the value flows through.
- `apps/web/src/app/(authenticated)/settings/page.tsx` (or the sidebar) — add an "API tokens" entry.
- `docs/reference/features.md` — append US-55..63 and bump the title range.
- `docs/reference/acceptance.md` — append acceptance rows for US-55..63.
- `docs/reference/env-vars.md` — note any new env vars (none expected beyond the existing `DATABASE_URL` / `REDIS_URL`).
- `tests/_helpers/trace.ts` — bump cap to 63.

## Data model

```prisma
model ApiToken {
  id          String    @id @default(cuid())
  userId      String    @map("user_id")
  companyId   String    @map("company_id")
  name        String
  tokenHash   String    @unique @map("token_hash")
  prefix      String                          // first 14 chars including "tt_pat_", indexed for lookup
  lastUsedAt  DateTime? @map("last_used_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([userId, companyId])
  @@index([prefix])
  @@map("api_tokens")
}

enum AuditSource {
  web
  extension
  mcp

  @@map("audit_source")
}

model AuditLog {
  // existing fields …
  source AuditSource @default(web)
}
```

- **Token format**: `tt_pat_<24-char base32 lowercase>` (CSPRNG, ~120 bits entropy). Total length 31.
- **Hashing**: argon2id with the same parameters as password hashing in `apps/web/src/lib/services/auth.ts`. No separate config.
- **Prefix**: first 14 chars (`tt_pat_` + first 7 of the secret) stored alongside the hash. Two reasons: (1) `WHERE prefix = $1` is selective enough to avoid scanning the table, then we argon2-verify the candidate row; (2) shown in the UI so users can recognise their tokens.
- **`lastUsedAt`** is updated fire-and-forget (no `await` in the auth path) and never produces an audit row.

## Tool surface

All six tools resolve `{userId, companyId}` from `McpAuthContext`. Input validation: Zod schemas; failures map to `invalid_args`. Output schemas are also Zod for forward compatibility.

| Tool                   | Args                                                                                              | Wraps                                                                                               | Audit (action)       | WS broadcast         |
| ---------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| `list_running_entries` | —                                                                                                 | `services/time-entries.listMyWeek` filtered to `endedAt IS NULL`; returns an array (possibly empty) | —                    | —                    |
| `list_recent_entries`  | `limit?: 1..50` (default 10)                                                                      | same                                                                                                | —                    | —                    |
| `start_timer`          | `description?`, `clientId?`, `projectId?`, `tagIds?: string[]`                                    | `services/time-entries.startTimer`                                                                  | `time_entry.created` | `timer.started`      |
| `stop_timer`           | `entryId` (required)                                                                              | `services/time-entries.stopTimer`                                                                   | `time_entry.updated` | `timer.stopped`      |
| `update_entry`         | `entryId` (required), `description?`, `clientId?`, `projectId?`, `billable?`, `tagIds?: string[]` | `services/time-entries.updateEntry`                                                                 | `time_entry.updated` | `time_entry.updated` |
| `list_catalog`         | `kind: 'clients' \| 'projects' \| 'tags'`, `query?: string`                                       | `services/catalog.*`                                                                                | —                    | —                    |

**Response shape**: tools return JSON-serialisable objects. Timestamps come from the services (UTC ISO 8601), and tool descriptions document the `Europe/Prague` business-day convention so the LLM can format for the user.

**Concurrent timers**: the app permits multiple running entries per user (US-21). `list_running_entries` always returns an array; the LLM must inspect it and pass an explicit `entryId` to `update_entry` / `stop_timer`. No "default to the running one" sugar in v1.

**Caps**: `list_recent_entries` truncates `description` to 500 chars per row and caps `limit` at 50. `list_running_entries` does not truncate (running set is small) but applies the same 50-row cap defensively.

## Auth, transport, request lifecycle

**Endpoint**: `POST /api/mcp` only. `GET` → `405`. Stateless transport: every request constructs a fresh `McpServer` and `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`. No `Mcp-Session-Id` plumbing; nothing to evict.

```ts
// apps/web/src/app/api/mcp/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (auth instanceof Response) return auth;

  const server = buildMcpServer(auth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export function GET() {
  return new Response(null, { status: 405 });
}
```

**`authenticateRequest`**:

1. Parse `Authorization: Bearer tt_pat_<rest>`. Missing/malformed → `401`.
2. `WHERE prefix = $1 AND revokedAt IS NULL` lookup. No row → `401`. (`User`/`Company` deletion cascades to `ApiToken`, so a missing token row also covers user/company removal.)
3. `argon2.verify(tokenHash, fullToken)`. Mismatch → `401`. Constant-time by construction.
4. Membership check via the existing `requireMembership(userId, companyId)`. Missing → `401`.
5. Rate-limit (Redis `INCR` on `mcp:rl:<tokenId>:<minute>` with `EXPIRE 60`). Over cap → `429` + `Retry-After: <seconds remaining in current minute>`.
6. Async `update lastUsedAt` (not awaited).
7. Return `{ userId, companyId, tokenId }`.

**Rate limit**: soft cap **60 req/min/token**, configurable later. Implemented in `authenticate.ts`; reuses the existing `apps/web/src/lib/redis.ts` client. No new dep.

**Logging**: one structured log per request: `{ tokenId, userId, companyId, tool, ms, status }`. No payloads (could include client/project names).

**No CORS**. MCP clients are server-to-server.

## Error handling

Multi-tenant 404 (constitution §3) is enforced by the existing services — a tool targeting an out-of-company entry throws `EntryNotFound`, mapped here:

| Condition                                                                 | MCP tool result                                                                  | Transport status      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------- |
| Bad/missing bearer, revoked, unknown prefix, hash mismatch, no membership | —                                                                                | `401`                 |
| Rate-limited                                                              | —                                                                                | `429` + `Retry-After` |
| Zod validation failure                                                    | `isError: true`, `code: 'invalid_args'`, includes Zod path                       | `200`                 |
| Entry not in company                                                      | `isError: true`, `code: 'not_found'` (generic message)                           | `200`                 |
| Service threw a domain error (e.g. "already running another timer")       | `isError: true`, `code: 'conflict'`, safe message                                | `200`                 |
| Unexpected exception                                                      | `isError: true`, `code: 'internal'`; full stack logged server-side, never echoed | `200`                 |

Existence-leak hygiene: never differentiate "wrong company" from "missing" — both surface as `not_found`. Tests assert that.

## Multi-tenant + audit invariants

- Every mutating tool produces **exactly one** audit row via the underlying service, with `source = 'mcp'`. Tests use `auditCount()` before/after.
- Token issuance and revocation produce an audit row (`entityType = 'ApiToken'`, action `created` / `revoked`).
- `AuditLog` rows remain immutable; no service touches `auditLog.update/delete`. The existing static check in `apps/web/tests/services/audit.test.ts` will be extended to cover the new MCP files.
- Reads (`list_running_entries`, `list_recent_entries`, `list_catalog`) write **no** audit rows.

## Testing strategy

All tests use the existing Vitest + testcontainers harness. No DB / audit / Redis mocks (constitution §2).

```
apps/web/tests/
├── services/
│   └── api-tokens.test.ts            # issue / verify / revoke / lastUsedAt
├── server/mcp/
│   ├── authenticate.test.ts          # bearer parsing, prefix lookup, revoked, rate limit
│   ├── tools/
│   │   ├── list-running-entries.test.ts
│   │   ├── list-recent-entries.test.ts
│   │   ├── start-timer.test.ts
│   │   ├── stop-timer.test.ts
│   │   ├── update-entry.test.ts
│   │   └── list-catalog.test.ts
│   └── cross-company.test.ts         # one block per tool, asserts 'not_found'
└── e2e/
    └── mcp-skill-flow.spec.ts        # Playwright: settings UI issues token; real MCP Client round-trips
```

- **One US per `it`.** Names embed the US: e.g. `it('US-59: update_entry replaces description on the targeted running entry')`.
- **Cross-company 404** has a block per tool that takes an ID (`update_entry`, `stop_timer`).
- **Audit assertion** in every mutation test uses `auditCount()`.
- **Helper**: `tests/_helpers/mcp.ts` spins up an in-process `Client` from `@modelcontextprotocol/sdk` against the route handler. One file, reused by all `tools/*.test.ts`.
- **`pnpm test:trace`** must report 100% across US-1..US-63. Trace cap is bumped in the same PR.

## Settings UI

`apps/web/src/app/(authenticated)/settings/api-tokens/` — Czech via `next-intl` under `settings.apiTokens.*`.

- **Index**: a list of the user's tokens across companies. Columns: `name`, `companyName`, `prefix`, `createdAt`, `lastUsedAt`, `revokedAt`. CTA "Vytvořit token".
- **Create dialog**: `name` + `companyId` (dropdown of memberships). Server action returns the plaintext token **once**; client shows a copy-to-clipboard view plus a "Stáhnout JSON pro Claude Code config" helper that emits the right snippet for `~/.claude.json`.
- **Revoke**: confirm dialog → sets `revokedAt`. Future calls `401`. Cannot un-revoke (issue a new one).

Help block on the page links to `docs/operations/mcp-server.md`.

## Rollout plan

1. Schema migration (`ApiToken`, `AuditLog.source` enum + column) — additive, no backfill.
2. `lib/services/api-tokens.ts` + unit tests.
3. `audit.ts` thread `source` through; default `'web'` keeps existing call sites unchanged.
4. `server/mcp/{authenticate,router,errors,tools/*}` + unit + cross-company tests.
5. `app/api/mcp/route.ts` wires them together.
6. Settings page + server actions.
7. Playwright E2E (`mcp-skill-flow`).
8. Docs: `docs/operations/mcp-server.md`, ADR, `apps/web/src/server/mcp/DESCRIPTION.md`.
9. `docs/reference/features.md` (US-55..63), `acceptance.md`, trace cap bump.

The ADR captures: `@modelcontextprotocol/sdk` added to the locked stack; stateless streamable-HTTP transport decision; personal-token auth choice over OAuth 2.1 DCR; `AuditLog.source` column rationale; route-handler-in-`apps/web` over separate `apps/mcp` service.

## Notes for the skill on the LLM side

Not in this repo. To close the user's described loop, the local skill would:

1. Call `mcp__plane.update_work_item` to mark the item Done.
2. Call `mcp__plane.create_work_item_comment` with the summary + commit SHA.
3. Call this server's `list_running_entries`, pick the right one (typically the latest, or the entry whose `clientId`/`projectId` matches), and call `update_entry { entryId, description }` with a description that embeds the Plane work-item identifier and the commit SHA.

The skill itself ships separately; this spec is only about the MCP server that step 3 depends on.
