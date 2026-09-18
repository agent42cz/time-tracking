# Changes

- Settings links directly to company management; second-company creation is transactional and writes one audit row. Company creation/switch invalidates the layout so names and permissions refresh.
- Extension header selects the active company, restores it on reopening, scopes the background poll, resets drafts and preserves the prior view when switching fails.
- Pending overlap dialogs carry company identity; simultaneous replay attempts share the same queue flush.
- Existing tokens can opt in to all current/future memberships without changing credentials or adding an MCP connector. Added `list_companies` and per-call company selection.
- Fixed single-company MCP tokens mutating another membership's entries, explicit REST company selection silently falling back, and cross-company client/project references on time-entry writes.
- Added additive migration `20260917211500_api_token_company_scope` and ADR-0017. No production migration, push, release or deployment performed.

## Validation

- New regressions first failed against the prior behavior: missing company selector/MCP discovery, token scope bypass, missing company audit, stale layout invalidation, silent REST fallback, cross-company catalog links, duplicate replay, and disabled emergency close during switching.
- Web Vitest: 54 files, 325 tests passed with real Postgres integration.
- Extension Vitest: 13 files, 78 tests passed.
- Extension Playwright: 20 scenarios passed, including persisted company selection, failed switch, offline replay, and emergency close during switching.
- Web Playwright: second-company creation/switch and upgrading the existing token with a real MCP HTTP client passed.
- All-workspace typecheck, repository lint, web production build, extension production build, and story traceability (109/109 active) passed.
- Entire migration history, including the new migration, applied successfully to an isolated local test database. Test database/Redis containers removed after verification.
