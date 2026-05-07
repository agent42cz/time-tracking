# Features (US-1 … US-53)

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
- **US-26** — User views their week as a list grouped by day with daily totals.
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
- **US-42** — Filtered view exports to CSV, XLSX, PDF.
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

## Coverage check

```bash
pnpm test:trace
```

Walks every test file (`*.test.{ts,tsx}`, `*.spec.{ts,tsx}`, `tests/**`) and looks for `\bUS-N\b`. Exits non-zero if any of US-1..US-53 has zero matches.
