# `packages/shared/src`

> Cross-runtime shared code: Zod validators, Europe/Prague time helpers, WebSocket wire types + reconnecting client.

## Purpose

Anything that needs to run in both Node (web app, ws service, tests) **and** the browser (extension popup, web client bundle) lives here. The package has no DOM or Node-only dependencies in its core, so both runtimes can import freely.

## Public surface

| Path                  | Export                      | Purpose                                                                                                                                                                                                                                   |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`            | re-exports                  | `./time`, `./validators`, `./ws` — all in one.                                                                                                                                                                                            |
| `time/index.ts`       | `getPeriodRange`, helpers   | Date-fns-based time math anchored to `Europe/Prague`. `getPeriodRange('today' \| 'week' \| 'month' \| 'custom', ...)` returns the half-open `[start, end)` for dashboard / reports queries. Honors Monday-start weeks and DST boundaries. |
| `time/time.test.ts`   | (test)                      | Asserts period boundaries, including DST transitions.                                                                                                                                                                                     |
| `validators/index.ts` | Zod schemas                 | Input validation for service entry points: invite, signup, time-entry create / update, report filters, etc. Used at trust boundaries (route handlers, server actions) — services trust their inputs once validated.                       |
| `ws/index.ts`         | wire types                  | `WsEvent` union and per-event payload types. Both publishers (`apps/web`) and consumers (`apps/web`, `apps/extension`) share these types.                                                                                                 |
| `ws/client.ts`        | `createWsClient(url, opts)` | Reconnecting WebSocket client with exponential backoff. Used by the web client bundle and the extension popup.                                                                                                                            |

## Subpath exports

`package.json` exposes:

- `.` — barrel (`./time`, `./validators`, `./ws`).
- `./time`
- `./validators`
- `./ws`

Use the narrowest import path possible; tree-shaking depends on it.

## Dependencies

- **Internal:** none (this package sits at the bottom of the dep graph).
- **External:** `zod` (validators), `date-fns` + `date-fns-tz` (time helpers). No `node:fs`, no DOM globals, no React.

## Used by

- `apps/web` — validators in route handlers + server actions; time helpers in dashboard / reports services; WS publish + types.
- `apps/ws` — WS wire types (matches what `apps/web` publishes).
- `apps/extension` — validators (mirror server-side checks before queueing), time helpers (formatting), WS client.

## Notes

- **Europe/Prague is hardcoded for v1.** Multi-timezone support is a non-goal (see `docs/business/README.md`). The `time/` helpers do not accept a timezone parameter.
- **Validators are the trust boundary.** A service can assume its input has the shape Zod validated. Don't re-validate inside services; don't skip validation at the boundary.
- **WS wire types are versioned implicitly.** Adding a new `WsEvent` variant is safe; renaming or changing existing payloads is a breaking change for old clients (browser caches, Chrome extension auto-update lag). Add new fields as optional; remove old fields only after enough time has passed.
- **No `Date.now()` ad hoc.** Tests use the shared time helper to keep assertions consistent across the suite.
