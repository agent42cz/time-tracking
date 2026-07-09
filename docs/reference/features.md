# Features (US-1 … US-101)

Feature catalogue keyed by user-story IDs from PRD §13. Test names embed the US ID so [`../../scripts/test-trace.ts`](../../scripts/test-trace.ts) can verify 100% coverage.

## Onboarding & authentication

- **US-1** — Visitor opens an invite link and creates an account in one flow.
- **US-2** — Visitor with an existing account: invite link logs them in and adds them to the new company automatically.
- **US-3** — User logs in with email + password **or** a magic link.
- **US-4** — User enables TOTP 2FA and downloads recovery codes.
- **US-5** — Session lasts 30 days with sliding renewal.

## Companies & membership

- **US-6** — User creates a new company and becomes its first Admin.
- **US-7** — User switches between companies from a top-bar dropdown.
- **US-8** — Admin invites a person by email with a pre-assigned role (Admin or User).
- **US-9** — Admin revokes or resends a pending invite.
- **US-10** — Admin promotes/demotes another member.
- **US-11** — Admin removes a member from the company; their historical TimeEntries remain under their name.
- **US-12** — Admin deletes the entire company (with confirmation).

## Clients, projects, and tags

- **US-13** — Admin creates clients and groups projects under them.
- **US-14** — Admin archives a client or project (vs. delete) so historical entries stay readable.
- **US-15** — When deleting a client/project with linked TimeEntries: prompt to delete those too or keep them as orphaned.
- **US-16** — Admin manages a company-wide tag list (rename, recolor, delete).
- **US-17** — User creates a new tag inline while filling out an entry.
- **US-18** — User sees (read-only) the canonical list of clients, projects, and tags.

## Time tracking — web

- **US-19** — User starts a timer with one click after typing a description.
- **US-20** — User attaches client / project / tags to a timer before or while running.
- **US-21** — User runs multiple timers in parallel.
- **US-22** — User stops a timer; it appears in today's list immediately.
- **US-23** — User adds a manual entry for any past date (not future; `end > start`).
- **US-24** — User edits any of their own past entries.
- **US-25** — User soft-deletes their own entries.
- **US-26** — User views their recent entries (last ~2 months) grouped by day with daily totals, on the timer page.
- **US-27** — User sees the change history of any of their entries.
- **US-28** — Admin edits or deletes any member's entry (with audit row).

## Time tracking — Chrome extension

- **US-29** — Extension stays logged in across browser sessions.
- **US-30** — Popup shows running timers and this week's entries.
- **US-31** — Changes propagate between extension and web within ~1s. Cross-company isolation is verified over a 3s window.
- **US-32** — User starts/stops/edits/deletes entries from the popup.
- **US-33** — "Play again" button on past entries resumes the activity as a new timer.
- **US-34** — Extension keeps working offline; queue replays in order on reconnect; conflicts resolved last-write-wins on the server.
- **US-35** — Visual indicator when there are unsynced local changes.

## Dashboard & reporting

- **US-36** — Dashboard shows total time, active members, top clients/projects for a chosen period (today / week / month / custom).
- **US-37** — Per-member table with totals across periods.
- **US-38** — Click a member to drill down into their full entry list with descriptions.
- **US-39** — Members with **zero entries** in the selected period are highlighted.
- **US-40** — Daily breakdown stacked by client (or by user — toggle).
- **US-41** — Reports filter matrix: date / client / project / member / tag / description text.
- **US-42** — Filtered view exports to CSV, XLSX, PDF. _(CSV done; PDF done via pdfmake/ADR-0010; XLSX still pending.)_
- **US-43** — User filters and exports their own entries.

## Audit & trash

- **US-44** — Firm-wide audit log filterable by actor / action / entity / date.
- **US-45** — Each entry exposes its own change history inline.
- **US-46** — Trash view: restore individual entries or purge them permanently.
- **US-47** — Soft-deleted entries are gone from normal views and reports.

## Settings

- **US-48** — User changes password and re-enrolls 2FA.
- **US-49** — User leaves a company they no longer belong to.
- **US-50** — Last-Admin guard: blocks leaving / demoting if it would leave the company without an Admin.

## Clients & projects management

- **US-51** — Search clients and projects on `/clients`. Substring match on either client or project name, diacritic- and case-insensitive. Clients matched via a project name auto-expand to show only the matching projects.
- **US-52** — Reorder clients via drag-and-drop. Order is canonical company-wide and honored everywhere clients are listed (timer, weekly report, extension catalog).
- **US-53** — Reorder projects within a client via drag-and-drop. Order is canonical company-wide and honored everywhere projects are listed.
- **US-54** — User (or admin) opens an Edit dialog from any entry list and corrects the entry's start and end times. Editing a running timer with no end specified keeps it running with the new start; supplying an end stops the timer. Validation rules (`end > start`, `start ≤ now`, `end ≤ now`) match manual-entry rules. Every save produces exactly one audit row.

## MCP server

- **US-55** — User issues a personal MCP token scoped to one company; plaintext shown exactly once; subsequent loads show only the prefix.
- **US-56** — User lists and revokes their MCP tokens; revocation is immediate.
- **US-57** — `list_running_entries` returns every currently running entry for the authenticated user as an array (possibly empty).
- **US-58** — `start_timer` opens a new running entry and broadcasts `timer.started`; other running entries are left alone.
- **US-59** — `update_entry` with an explicit `entryId` patches fields; one audit row written with `source = 'mcp'`.
- **US-60** — `stop_timer` with an explicit `entryId` ends that entry and broadcasts `timer.stopped`.
- **US-61** — A token scoped to Company A targeting Company B's entry returns the MCP `not_found` error (no existence leak).
- **US-62** — A revoked token returns HTTP `401` on every call.
- **US-63** — A token over the rate limit returns HTTP `429` with `Retry-After`; next bucket allows again.

## Auto-stack overlapping entries

- **US-64** — User enables "Automaticky řadit překrývající se záznamy za sebou" in profile settings; off by default.
- **US-65** — With the setting OFF, saving an overlapping closed entry succeeds with no shifts and no dialog (current behavior).
- **US-66** — With the setting ON, saving a non-overlapping closed entry goes through with no dialog flash.
- **US-67** — With the setting ON, saving a closed entry that overlaps an existing closed entry opens a preview dialog listing the candidate's final placement and every cascaded shift. The dialog offers **Posunout vpřed a uložit**, **Posunout zpět a uložit**, **Uložit bez posunu**, **Zrušit**.
- **US-68** — Confirming the preview (either direction) shifts every affected entry preserving its duration, places the candidate at its final position, and writes one audit row per shifted entry (`action = 'time_entry.shifted_by_auto_stack'`, `meta.direction` is `'forward'` or `'backward'`) plus the audit row for the candidate write.
- **US-69** — "Uložit bez posunu" saves the candidate using the existing save path; no shifts; behaves identically to setting OFF for that one save.
- **US-70** — Stopping a running timer triggers auto-stack on the resulting closed entry when the setting is ON.
- **US-71** — Editing an existing closed entry's times (US-54 path) triggers auto-stack; the entry being edited is excluded from the timeline used for planning.
- **US-72** — A cross-company entry id returns MCP-style `not_found` on both the preview endpoint and the save endpoint. No existence leak.
- **US-73** — Two concurrent saves on the same user's day serialize via `SELECT ... FOR UPDATE`; both succeed; no residual overlap.
- **US-74** — When the forward cascade pushes the final entry's `endedAt` past now, the save still succeeds. The entry is stored with `endedAt > now` and appears in the UI as a normal closed entry. The candidate itself must still satisfy `endedAt ≤ now`.
- **US-75** — Choosing **Posunout zpět a uložit** shifts the candidate so its `endedAt` equals the existing overlapping entry's `startedAt`, preserving the candidate's duration; entries earlier than the candidate's new position are cascaded backward by the same rule. The candidate's resulting `startedAt` may land in an earlier calendar day.
- **US-76** — Starting a timer while another is running never triggers auto-stack (both are `endedAt IS NULL`, excluded). Auto-stack fires when the **second** of two parallel timers is stopped, because that stop is when the second timer becomes a closed entry that overlaps the now-closed first timer. The user is offered the preview dialog at that moment.

## Auto-stack — extension + manual mode (US-79…US-88)

- **US-79** — With the setting ON and no overlap, the stop response carries `overlap: null` and no dialog appears.
- **US-80** — With the setting ON and an overlap, the stop commits as a plain stop and the response carries the overlap payload; the extension opens the auto-stack sheet for the now-closed entry.
- **US-81** — The extension sheet offers Vpřed / Zpět / Ručně and "Uložit bez posunu"; confirming applies the shifts (preserving each duration) and audits one row per shifted entry plus the candidate update.
- **US-82** — Manual mode: the user pins the work's start time; the earlier overlapping ("blocker") entry moves earlier preserving its duration (cascading into entries before it); the candidate's `endedAt` is unchanged.
- **US-83** — A stop performed offline is queued; on reconnect the replay detects the overlap, records it in `tt:pending-overlaps`, and the popup shows the sheet. Survives a browser kill mid-queue.
- **US-84** — The web `AutoStackPreviewDialog` gains a "Ručně" tab with a start-time input (parity); choosing it applies the same manual planner result.
- **US-85** — A cross-company entry id returns `not_found` (404) on `/api/v1/entries/{id}/auto-stack/preview` and `/api/v1/entries/{id}/auto-stack`. No existence leak.
- **US-86** — A manual start in the future, ≥ the candidate's `endedAt`, or outside the candidate's calendar-day window is rejected (`invalid_window`) with no mutation.
- **US-87** — `GET /api/v1/me` returns the user's `autoStackOverlaps` setting; the extension reads and stores it. The setting remains read-only in the extension (managed in the web app).
- **US-88** — Stopping a timer in the extension with the setting OFF performs a plain stop; the stop response carries `overlap: null` and no dialog appears.

## Reports — grouped view + PDF export

- Reports group time entries by project / member / day, with per-group subtotals and a grand total (see US-77 tests in `report-grouped.test.ts`).
- Reports export to PDF (filter-respecting + one-click previous calendar month), Europe/Prague (see US-78 tests in `report-pdf.test.ts`).
- **US-89** — Reports **Export dialog**: one "Export" button opens a dialog to pick the **period**, the **person(s)** (or "Všichni členové"), and the **format** (PDF/CSV). The export is scoped to that selection instead of always dumping every member together, and the three old header export buttons are removed; grouping defaults to per-member sections when several/all people are exported (see US-89 tests in `export-url.test.ts`, `date-presets.test.ts`, `reports-export-csv-route.test.ts`).

## Dashboard — client work funds

- **US-90** — Admin configures a per-client "work fund" (weekly hour commitment, week-start weekday, working days) and sees team-wide weekly/monthly progress bars plus a per-day green/red breakdown (working-days clients) on the dashboard and, admin-only, in the extension header; a combined bar sums all fund clients. Hours-only clients (no `workingDays`) get a proportional monthly target and no per-day breakdown. Admin-only for now (no `manager` role yet).
- **US-91** — Dashboard shows the Czech **Nepřiřazený klient** / **Nepřiřazený projekt** labels (not an English `(deleted client)` / `(deleted project)` fallback) for time entries with no client/project assigned.

## Time tracker fixes (AIAGE-51)

- **US-92** — The extension's running row renders `HH:MM:SS` and updates every second; stopped rows, day totals and summary cards stay `HH:MM`. Partial revert of AIAGE-28, which had removed seconds everywhere in the extension. Because the tick is now gated on a running timer, a sheet captures `nowIso` when it opens.
- **US-93** — A non-admin owner restores their own soft-deleted entry, producing exactly one `restore` audit row. Another member's entry, or a cross-company entry, returns `not_found`.
- **US-94** — `/trash` is scoped by role: a member sees only their own deleted entries; an admin sees every member's in the active company; a non-member gets `not_found`.
- **US-95** — Trash rows expose start, end and duration, so an entry with no description is identifiable. A soft-deleted _running_ entry shows a null end.
- **US-96** — After deleting an entry, an undo affordance restores it; letting it expire (10 s) leaves the entry in the trash.
- **US-97** — An admin purges an entry permanently from the trash. The row is hard-deleted (cascading its tag joins) and exactly one `purge` audit row survives, carrying the `before` snapshot. Members cannot purge; cross-company returns `not_found`.
- **US-98** — `POST /api/cron/purge` hard-deletes entries soft-deleted more than 30 days ago, writing one actor-less `purge` audit row each; entries younger than 30 days are kept. A missing or incorrect `CRON_SECRET` returns 401. Driven by a Coolify scheduled task (ADR-0011).
- **US-99** — Opening an entry sheet in the extension while the popup is scrolled shows the sheet's header and `Název` field, because the sheet is pinned to the viewport (`fixed`, not `absolute`, which stretched it across the document-tall root).
- **US-100** — The `MultiSelect` popover renders above its clipping ancestors (`Card`'s `overflow-hidden`, `ConfirmModal`'s `overflow-y-auto`) and scrolls when its options exceed its max height.
- **US-101** — The audit action filter offers every `AuditAction` value, derived from the Prisma enum so it cannot drift.

## Coverage check

```bash
pnpm test:trace
```

Walks every test file (`*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, `tests/**`) and looks for `\bUS-N\b`. Exits non-zero if any of US-1..US-101 has zero matches.
