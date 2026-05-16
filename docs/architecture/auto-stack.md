# Auto-stack overlapping entries

When users enable the auto-stack feature (`User.autoStackOverlaps`), the system helps resolve time entry overlaps by automatically shifting overlapping entries forward or backward in time. Since US-21 allows multiple parallel timers, closed time entries can overlap on a user's calendar. Auto-stack is opt-in, runs on entry save (manual create, edit, or stop), and never fires on `startTimer` (preserving concurrent clocks).

See [ADR-0009](../decisions/0009-auto-stack-overlapping-entries.md) for the decision, [US-64..US-74 spec](../../tasks/us-64-74-auto-stack-overlapping-entries.md) for acceptance criteria, and `apps/web/src/lib/time-entries/auto-stack.ts` for the pure planning logic. The save path (`auto-stack-save.ts`) uses `SELECT ... FOR UPDATE` row locks to handle concurrent writes safely: both save requests serialize and succeed, with the final shift plan re-computed at transaction time.
