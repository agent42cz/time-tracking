# CLIENTS-05 — Playwright E2E suite for clients page

## What

Bring the existing-but-deferred Playwright runner into active use, then write an end-to-end suite covering the search and drag-and-drop features delivered by [CLIENTS-03](../CLIENTS-03/assignment.md) and [CLIENTS-04](../CLIENTS-04/assignment.md). Tests run against the same testcontainers-managed Postgres + Redis stack that the Vitest integration suite uses.

## Why

The constitution previously noted that Playwright is "wired but deferred for v1" — manual smoke testing covered the gaps. Drag-and-drop changes that calculus: keyboard-reorder and touch-reorder behavior is hard to manually re-verify on every PR, and the failure mode (an admin's order silently breaks) is annoying enough that we want a regression net. The user explicitly opted into autonomous testing for this epic, so we end the deferral here.

Once Playwright is healthy for `/clients`, future epics can add E2E coverage incrementally without paying the bring-up cost again.

## Acceptance criteria

### Runner bring-up

- [ ] `apps/web/playwright.config.ts` is verified to boot Postgres + Redis using the same testcontainers global setup that Vitest uses (or a shared module). If a separate setup currently exists, consolidate.
- [ ] A Playwright fixture provides a freshly seeded company per test (admin user signed in, a small but realistic catalogue of clients and projects).
- [ ] `pnpm test:e2e` script in `apps/web/package.json` runs the Playwright suite headlessly.
- [ ] CI workflow runs `pnpm test:e2e` as a required step after `pnpm test:all`.

### Test coverage

All tests live in `apps/web/tests/e2e/clients-search-reorder.spec.ts` and use `test('US-XX: ...')` naming so the trace tracker counts them.

- [ ] **US-51: search filters clients by name and auto-expands clients with matching projects.** Type a substring matching one project name, assert non-matching client rows are hidden, the matching parent client is expanded, and only matching projects are rendered under it.
- [ ] **US-51: clearing search collapses auto-expanded clients to the manual state.** Open client A manually, search to auto-expand client B, clear search, assert A is still open and B is collapsed.
- [ ] **US-51: search is diacritic-insensitive.** Seed a client named "Agént", search "agent", assert match.
- [ ] **US-51: Esc clears the search input.**
- [ ] **US-52: dragging a client to a new position persists across reload.** Drag client B above client A, reload, assert order survived.
- [ ] **US-52: optimistic update reverts on server error.** `page.route('**/clients', route => route.fulfill({ status: 500 }))` (or the precise pattern for the action endpoint), drag, assert the row snaps back and the Czech error banner appears.
- [ ] **US-52: keyboard reorder works.** Tab to a drag handle, Space to lift, ArrowDown, Space to drop, assert new order persists across reload.
- [ ] **US-52: touch drag works on iPhone viewport.** `test.use({ ...devices['iPhone 13'] })`, simulate a 5px-threshold pointer drag, assert reorder.
- [ ] **US-52: cross-company existence-leak guard.** Sign in as company A's admin, attempt to reorder using a client id from company B (via direct action call from a test page or thin route), assert the generic Czech failure message renders and that no audit row was written for the foreign client.
- [ ] **US-53: dragging a project within a client persists across reload.**
- [ ] **US-53: drag handles are hidden and a hint is shown while a search is active.**

### Trace tracker

- [ ] `pnpm test:trace` recognises `test('US-XX: ...')` from Playwright spec files; if it currently only scans Vitest output, extend the regex to cover Playwright too.
- [ ] After this task lands, US-51, US-52, US-53 each have ≥1 reference in either Vitest or Playwright; `pnpm test:trace` reports 100% covered.

### Documentation

- [ ] `docs/architecture/` updated to remove the "Playwright wired but deferred" caveat — Playwright is now in active use.
- [ ] `CLAUDE.md` reference to "Playwright is wired but deferred for v1" updated to reflect actual state. (One-line edit.)
- [ ] `docs/operations/` (or wherever the test commands live) gains a short note about `pnpm test:e2e` and how it shares testcontainers setup with Vitest.

### Verification

- [ ] `pnpm test:all && pnpm test:e2e && pnpm test:trace` all exit 0 locally and in CI.

## Out of scope

- Playwright coverage of any page other than `/clients`. Other surfaces can adopt E2E in their own epics.
- Visual-regression snapshots. We're testing behavior, not pixels.
- Cross-browser matrix. Default to Chromium-only for now; add Firefox / WebKit if a regression motivates it.

## Dependencies

- [CLIENTS-01](../CLIENTS-01/assignment.md), [CLIENTS-02](../CLIENTS-02/assignment.md), [CLIENTS-03](../CLIENTS-03/assignment.md), [CLIENTS-04](../CLIENTS-04/assignment.md) — the entire feature must be working end-to-end before E2E tests can be written against it.

## Notes

- The dnd-kit keyboard reorder pattern (`Tab → Space → ArrowDown → Space`) is the same flow dnd-kit's own docs document. If the test is flaky, prefer fixing test setup over weakening the assertion (e.g. wait for the announcement element to become live before pressing Space).
- For touch, Playwright's `page.touchscreen` doesn't trigger pointer events the same way real touches do. Use `page.locator('[data-drag-handle]').dispatchEvent('pointerdown', { pointerType: 'touch', ... })` if the high-level helpers prove flaky.
- Cross-company existence-leak guard: the cleanest implementation is a tiny test-only route that calls the action with arbitrary inputs, gated by `process.env.NODE_ENV !== 'production'` and an internal header. If that's too invasive, exercise the guard via the service layer in Vitest and trust integration coverage there — but don't drop it entirely.
