# server/mcp/

## Purpose

Token-authenticated MCP server. Exposes time-tracking tools (start/stop/update/list time entries, list catalog) to MCP clients like Claude Code or Cursor.

## Public surface

- `POST /api/mcp` (route handler at `apps/web/src/app/api/mcp/route.ts`) — single entry point. Stateless streamable-HTTP transport.
- `buildMcpServer({ auth, db? })` — constructs a fresh `McpServer` per request with all tools registered.
- `authenticateRequest(req, { db })` — bearer auth, membership check, rate-limit. Returns `McpAuthContext` or a `Response` for 401/429.

## Dependencies

- `@modelcontextprotocol/sdk` — protocol implementation.
- `lib/services/api-tokens` — issue/verify/revoke tokens.
- `lib/services/time-entries` — start/stop/update/list helpers (the latter two added for MCP).
- `lib/services/catalog` — list clients/projects/tags.
- `lib/auth/passwords` — argon2id hash/verify for tokens.
- `lib/api/rate-limit-ip` — pattern source for per-token rate limit (not imported directly).

## Used by

- `apps/web/src/app/api/mcp/route.ts` — route handler that wires everything together.
- `apps/web/tests/server/mcp/**` — unit tests.
- `apps/web/tests/_helpers/mcp.ts` — in-process MCP client harness used by tool tests.

## Notes

- Tool handlers stay thin — all business logic lives in `lib/services/*`. The MCP layer is just translation: Zod input validation, service call, error mapping via `errors.ts`, response shaping.
- Existence-leak hygiene: `forbidden` and `not_found` from services both surface as MCP `not_found`. Never differentiate.
- Audit + WS broadcasts come for free because tools call the existing services that already do both.
