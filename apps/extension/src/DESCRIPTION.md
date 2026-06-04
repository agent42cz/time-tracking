# `apps/extension/src`

> Chrome MV3 popup. Mirrors the web app's timer + weekly view in real time. Persistent offline queue replays mutations on reconnect.

## Purpose

The popup is a self-contained Vite + React app loaded by the MV3 manifest. It authenticates against the web app, holds an open WebSocket to `apps/ws` for live updates, and queues mutations locally when offline so the user can keep tracking time without network.

## Public surface

| File              | Responsibility                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `popup.tsx`       | Top-level popup React tree — Clockify-style layout: company switcher, quick-start row, parallel running timers, "This week" grouped by day with ⋯ menu and "Play again". |
| `popup-entry.tsx` | Vite entry point — mounts `popup.tsx` into the popup HTML.                                                                                                               |
| `index.ts`        | Background script (MV3 service worker) — keeps the auth state warm and proxies messages between popup and storage.                                                       |
| `index.css`       | Tailwind entry for the popup styles.                                                                                                                                     |
| `api.ts`          | HTTP client for the web app's API surface (route handlers + tRPC). Adds the Bearer session token from `chrome.storage.local`.                                            |
| `storage.ts`      | Thin wrapper over `chrome.storage.local` for reads/writes of session, queue, and cached state.                                                                           |
| `sync.ts`         | Connects to `apps/ws`, applies incoming events to local state, wires reconnect via `packages/shared/src/ws/client.ts`.                                                   |
| `queue.ts`        | The persistent FIFO offline queue. Commit-before-send so a browser kill mid-replay leaves a recoverable queue.                                                           |
| `queue.test.ts`   | Vitest unit tests for the queue: in-order replay, conflict resolution, transient retry, browser-kill resume, pending-count surface for the unsynced indicator.           |
| `EntrySheet.tsx`  | Overlay sheet for creating or editing a time entry inline; also supports inline admin project creation without leaving the popup.                                        |
| `format.ts`       | Formatting helpers — `fmtDurationHM` converts a millisecond duration to a human-readable `Hh Mm` string.                                                                 |
| `datetime.ts`     | Conversion helpers between `datetime-local` input values and ISO 8601 strings (used by `EntrySheet` to read/write date-time fields).                                     |

## Offline queue (the load-bearing piece)

Mutations attempted while disconnected are appended to a FIFO queue in `chrome.storage.local`. On reconnect:

1. The queue is read and replayed in order.
2. Each replay is a regular HTTP request — same shape, same idempotency contract as if the mutation had originated online.
3. If the server returns a conflict (timestamp / version mismatch), the user gets a non-blocking toast; the server is authoritative (last-write-wins at the server boundary).
4. Transient failures retry with backoff. Persistent failures surface in the popup with an explicit "couldn't sync" message.

The "commit before send" property means: if the browser is killed mid-flush, the queue still contains every unflushed mutation, and replay is idempotent on next open.

## Dependencies

- **Internal:** `@tt/ui` (shared primitives), `@tt/shared` (validators, time helpers, WS wire types + client).
- **External:** `react`, `react-dom`, Tailwind via Vite. No Auth.js — the extension authenticates by holding a session token issued by the web app.

## Used by

The MV3 manifest is the runtime entry. Users install the packaged extension; the popup loads on click; the background service worker keeps the session alive.

## Notes

- **Czech UI** — same `next-intl` keys as the web app are mirrored as a static catalogue at build time.
- **No styled-components.** Tailwind + `clsx` only, matching `packages/ui`.
- **Tests are unit-only.** Real Chrome integration is verified manually with a packed extension (per the original PRD §14.8 — things AI cannot fully automate).
- **Distribution.** Packaged as `.zip` for sideload + Chrome Web Store listing. Works on Brave, Arc, Edge by default (Chromium).
