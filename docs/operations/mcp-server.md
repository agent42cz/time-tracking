# MCP server — operations guide

## Endpoint

`POST https://<host>/api/mcp`

`GET` returns **405 Method Not Allowed**. Only `POST` is handled.

## Authentication

All requests must carry a bearer token issued from `/settings/api-tokens`:

```
Authorization: Bearer tt_pat_<24-char-random>
```

Tokens default to one `(user, company)` pair; their owner can explicitly enable all their memberships on the same credential (see Multiple companies below). The plaintext token is shown exactly once at issuance; subsequent loads in the UI show only the prefix (e.g. `tt_pat_aBcD12…`). Treat tokens like passwords — store them in your MCP client's secrets config, not in plain text files.

**HTTP 401** is returned when the token is missing, malformed, unknown, or revoked.

## Rate limit

60 requests per minute per token (sliding window, backed by Redis with in-memory fallback).

When the limit is exceeded the server returns **HTTP 429** with a `Retry-After` header (seconds until the next window opens). The client should honour `Retry-After` and retry after that delay.

## Tools

| Tool                   | Description                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_running_entries` | Returns all currently running (no `endTime`) entries for the authenticated user. Returns an empty array when none are running.                                                                                                      |
| `list_recent_entries`  | Returns the N most recent entries (running or stopped) for the authenticated user, newest first.                                                                                                                                    |
| `start_timer`          | Opens a new running entry with an optional `title`, client/project. Broadcasts `timer.started` over WebSocket.                                                                                                                      |
| `stop_timer`           | Stops the entry identified by `entryId`. Requires the entry to belong to the authenticated user's company. Broadcasts `timer.stopped`.                                                                                              |
| `update_entry`         | Patches one or more fields (`title`, `description`, clientId, projectId) of the entry identified by `entryId`. `title` is the entry name; `description` is the longer free-text detail. Writes one audit row with `source = 'mcp'`. |
| `list_catalog`         | Returns the full list of active clients and projects for the authenticated company — useful for resolving names to IDs before calling other tools.                                                                                  |
| `list_companies`       | Returns the companies accessible to the token owner within its scope, including the default company.                                                                                                                                |

> The tag feature was removed in AIAGE-57: `tagIds` is no longer accepted by `start_timer` or `update_entry`, and no tool returns tag data.

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
3. **Patch the title** — call `update_entry` with the chosen `entryId` and a `title` that embeds the Plane work-item identifier and the relevant commit SHA (use `description` for any longer free-text detail). For example:
   ```
   TT-42 — implement rate-limit middleware (abc1234)
   ```
4. **Stop the timer** — optionally call `stop_timer` with the same `entryId` once the work session ends.

The Plane `mark_done` and `create_comment` steps run in the same LLM turn via the `mcp__plane` server — this server handles only the time-tracking side.

## Issuing and revoking tokens

Tokens are managed from the web UI at `/settings/api-tokens`. Each token can be given a label (e.g. "Claude Code — laptop") and uses the company selected at issuance as its default. Its owner can enable all memberships without rotating the token. To rotate a token: revoke the old one and issue a new one; update your MCP client config with the new value.

There is no token expiry by default. Revocation is immediate — a revoked token returns 401 on the next request.

## Multiple companies through an existing connection

In **Nastavení → API tokeny**, enable **Všechny moje firmy** on the existing token.
Its secret and MCP URL stay the same; no second connector is required. The option
includes present and future companies where the token owner is a member. Leaving
it disabled preserves the original single-company scope.

Call `list_companies` to discover permitted company IDs and the default. Pass
`companyId` to `list_catalog`, `list_running_entries`, `list_recent_entries`, and
`start_timer`. Omitting it uses the token's original company. `stop_timer` and
`update_entry` infer company from `entryId`; optional `companyId` must agree.
Selection applies only to that call and does not change another conversation,
the web cookie, or the extension. An inaccessible company returns `not_found`.

Deploy the additive `20260917211500_api_token_company_scope` migration before the
new application. Existing tokens default to `allCompanies = false`. The original
company remains the default and lifecycle anchor (membership removal invalidates
authentication; deleting that company deletes its tokens). See ADR-0017.
