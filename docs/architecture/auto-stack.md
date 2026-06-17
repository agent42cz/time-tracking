# Auto-stack overlapping entries

When users enable the auto-stack feature (`User.autoStackOverlaps`), the system helps resolve time entry overlaps by automatically shifting overlapping entries forward or backward in time. Since US-21 allows multiple parallel timers, closed time entries can overlap on a user's calendar. Auto-stack is opt-in, runs on entry save (manual create, edit, or stop), and never fires on `startTimer` (preserving concurrent clocks).

See [ADR-0009](../decisions/0009-auto-stack-overlapping-entries.md) for the decision, [US-64..US-74 spec](../../tasks/us-64-74-auto-stack-overlapping-entries.md) for acceptance criteria, and `apps/web/src/lib/time-entries/auto-stack.ts` for the pure planning logic. The save path (`auto-stack-save.ts`) uses `SELECT ... FOR UPDATE` row locks to handle concurrent writes safely: both save requests serialize and succeed, with the final shift plan re-computed at transaction time.

US-79..US-88 extend auto-stack to the Chrome extension and add a manual-mode tab to the web dialog. Key additions:

- `GET /api/v1/me` now includes `autoStackOverlaps: boolean` (US-87); the extension stores it and uses it to decide whether to check for overlaps after a stop.
- `POST /api/v1/timer/[id]/stop` returns `overlap: OverlapInfo | null` (US-79, US-80, US-88); `null` when the setting is OFF or there is no overlap.
- Two new REST routes drive the extension sheet: `GET /api/v1/entries/[id]/auto-stack/preview` (read-only plan) and `POST /api/v1/entries/[id]/auto-stack` (apply); both return 404 for cross-company ids (US-85) and 422 `invalid_window` for an invalid manual start (US-86).
- Offline stop replays that detect an overlap write the `OverlapInfo` to `chrome.storage.local` under the key `tt:pending-overlaps` using a commit-then-resolve model: the stop is committed first, then the overlap is stored for the popup to pick up on next open (US-83).
- The web `AutoStackPreviewDialog` adds a "Ručně" tab with a start-time input so the user can pin the candidate's start time; the manual planner cascades the earlier blocker backward preserving its duration (US-82, US-84).
