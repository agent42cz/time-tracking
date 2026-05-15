# MCP server — operations guide

## Endpoint

`POST https://<host>/api/mcp`

`GET` returns **405 Method Not Allowed**. Only `POST` is handled.

## Authentication

All requests must carry a bearer token issued from `/settings/api-tokens`:

```
Authorization: Bearer tt_pat_<24-char-random>
```

Tokens are scoped to one `(user, company)` pair. The plaintext token is shown exactly once at issuance; subsequent loads in the UI show only the prefix (e.g. `tt_pat_aBcD12…`). Treat tokens like passwords — store them in your MCP client's secrets config, not in plain text files.

**HTTP 401** is returned when the token is missing, malformed, unknown, or revoked.

## Rate limit

60 requests per minute per token (sliding window, backed by Redis with in-memory fallback).

When the limit is exceeded the server returns **HTTP 429** with a `Retry-After` header (seconds until the next window opens). The client should honour `Retry-After` and retry after that delay.

## Tools

| Tool                   | Description                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_running_entries` | Returns all currently running (no `endTime`) entries for the authenticated user. Returns an empty array when none are running.                                              |
| `list_recent_entries`  | Returns the N most recent entries (running or stopped) for the authenticated user, newest first.                                                                            |
| `start_timer`          | Opens a new running entry with an optional description, client/project, and tags. Broadcasts `timer.started` over WebSocket.                                                |
| `stop_timer`           | Stops the entry identified by `entryId`. Requires the entry to belong to the authenticated user's company. Broadcasts `timer.stopped`.                                      |
| `update_entry`         | Patches one or more fields (description, clientId, projectId, tagIds, startTime, endTime) of the entry identified by `entryId`. Writes one audit row with `source = 'mcp'`. |
| `list_catalog`         | Returns the full list of active clients, projects, and tags for the authenticated company — useful for resolving names to IDs before calling other tools.                   |

## Error codes

Tool errors are returned as `isError: true` call results with structured content:

| `code`         | Meaning                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not_found`    | Entry/client/project not found, or belongs to a different company (existence-leak prevention — `forbidden` and `not_found` from the service layer both surface as this code). |
| `invalid_args` | Input failed Zod validation (missing required field, wrong type, `end ≤ start`, future date, etc.).                                                                           |
| `conflict`     | The requested operation conflicts with current state (e.g. stopping an already-stopped timer).                                                                                |
| `internal`     | Unexpected server error. Check application logs.                                                                                                                              |

## Claude Code config example

Add this block to your Claude Code `settings.json` (or the equivalent config for your MCP client):

```json
{
  "mcpServers": {
    "time-tracking": {
      "type": "http",
      "url": "https://<host>/api/mcp",
      "headers": { "Authorization": "Bearer tt_pat_…" }
    }
  }
}
```

Replace `<host>` with your deployment hostname and `tt_pat_…` with the full token value shown at issuance.

## Example workflow — update entry from a commit

This is the primary use-case the MCP server was designed for. The Plane side (marking a work item done, adding a comment) is handled by the existing `mcp__plane` server; only the time-tracking leg is shown here.

1. **List running timers** — call `list_running_entries` to see what's currently tracked. Pick the entry you want to update (note its `id`).
2. **Resolve catalog IDs if needed** — call `list_catalog` once to get the `clientId`/`projectId` for the work you're logging against.
3. **Patch the description** — call `update_entry` with the chosen `entryId` and a `description` that embeds the Plane work-item identifier and the relevant commit SHA. For example:
   ```
   TT-42 — implement rate-limit middleware (abc1234)
   ```
4. **Stop the timer** — optionally call `stop_timer` with the same `entryId` once the work session ends.

The Plane `mark_done` and `create_comment` steps run in the same LLM turn via the `mcp__plane` server — this server handles only the time-tracking side.

## Issuing and revoking tokens

Tokens are managed from the web UI at `/settings/api-tokens`. Each token can be given a label (e.g. "Claude Code — laptop") and is scoped to the company that was active when you issued it. To rotate a token: revoke the old one and issue a new one; update your MCP client config with the new value.

There is no token expiry by default. Revocation is immediate — a revoked token returns 401 on the next request.
