# AIAGE-78 — Tracker MCP: read more than 50 entries

The MCP server could only return the latest 50 entries, so a monthly total per
client (e.g. one client's October 2026 for invoicing) could not be computed.

## Acceptance

- [x] All of a user's entries for a month can be read over MCP (cursor pagination, `from`/`to`, client/project filters).
- [x] A per-client monthly total is available without pulling every row, and matches `/reports`.
- [x] Each row has a duration and a running flag; `list_recent_entries` stays backwards compatible.

## Added in the same session (requested by the owner)

- `delete_entry`, `startedAt`/`endedAt` on `update_entry`, `create_client`/`create_project`.
