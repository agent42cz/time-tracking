# 0008 — MCP server for time-tracking

- **Status:** Accepted
- **Date:** 2026-05-15
- **Deciders:** misalenert@gmail.com
- **Related:** `docs/superpowers/specs/2026-05-15-mcp-server-design.md`, US-55..US-63

## Context

A user wants to drive time-tracking entries from inside a Claude Code or Cursor session: inspect currently running timers, patch a description with a Plane work-item ID and commit SHA, and start/stop timers without leaving the terminal. The companion Plane workflow already runs via the existing `mcp__plane` MCP server; closing the time-tracking leg was the missing piece.

Auth.js sessions (cookie-based) don't fit machine clients. A token mechanism scoped to a `(user, company)` pair is required so agents can act on behalf of a user without storing session cookies. Users may have multiple timers running concurrently (US-21), so every tool that targets a specific entry takes an explicit `entryId`.

## Decision

Add an MCP server to the existing `apps/web` Next.js app as a single route handler at `POST /api/mcp`. This is a constitution §1 amendment: `@modelcontextprotocol/sdk` is added to the locked stack.

Key design choices:

- **Personal API tokens** (argon2id-hashed, prefix `tt_pat_`, 24-char random secret) rather than OAuth 2.1 DCR. Tokens are scoped to one `(user, company)` pair and stored in a new `ApiToken` Prisma model.
- **Stateless transport**: `WebStandardStreamableHTTPServerTransport` — each POST creates a fresh `McpServer` instance; no persistent connection state is kept in the process.
- **New `AuditLog.source` enum** (`web | extension | mcp`) so admins can distinguish which channel produced a mutation.
- **Per-token Redis-backed rate limit** (60 req/min sliding window) with an in-memory fallback when Redis is unavailable.
- Six tools: `list_running_entries`, `list_recent_entries`, `start_timer`, `stop_timer`, `update_entry`, `list_catalog`.

## Alternatives considered

### Alternative A — Separate `apps/mcp` service

A standalone service (e.g., a Node.js process alongside `apps/ws`) would isolate concerns but requires its own Dockerfile, Coolify service, port allocation, shared Prisma client, and separate deployment pipeline. Given that the MCP handler is stateless and thin, the complexity cost outweighs the isolation benefit. Rejected in favour of a single Next.js route handler that reuses all existing service infrastructure.

### Alternative B — OAuth 2.1 Dynamic Client Registration

OAuth 2.1 DCR is the MCP spec's recommended auth path for multi-tenant scenarios. However, it requires an authorization server, redirect flows, and client registration endpoints — disproportionate complexity for a self-hosted, single-owner instance where the user is already authenticated in the web UI when they issue the token. The simpler personal-API-token model achieves the same trust boundary (user identity + company scope) without any redirect infrastructure. Rejected with the understanding that a migration to OAuth DCR is viable later via a new ADR.

## Consequences

### Positive

- Machine clients (Claude Code, Cursor, scripts) can now read and mutate time entries without a browser session.
- Audit trail distinguishes `mcp`-sourced changes from `web` and `extension` changes.
- No new infrastructure: the MCP endpoint lives inside the existing Next.js deployment.
- All existing services are unchanged in their default behaviour; the `audit.source` and `audit.opts` additions are additive with safe defaults.

### Negative

- One new npm dependency in `apps/web`: `@modelcontextprotocol/sdk@1.29.0`.
- One additive DB migration (`add_api_tokens_and_audit_source`).
- Personal tokens are long-lived until explicitly revoked — users must treat them like passwords.

### Neutral

- Trace cap bumps 54 → 63 in `scripts/test-trace.ts`.
- No new env vars required beyond the existing `DATABASE_URL` and `REDIS_URL`.
- `GET /api/mcp` returns HTTP 405; only POST is handled.

## Follow-ups

- [ ] Consider adding token expiry (e.g., 90-day TTL) as a future hardening measure.
- [ ] Evaluate OAuth 2.1 DCR if the user base grows beyond a single-owner deployment.
- [ ] Add `list_recent_entries` integration test (currently covered by tool-unit test only).
