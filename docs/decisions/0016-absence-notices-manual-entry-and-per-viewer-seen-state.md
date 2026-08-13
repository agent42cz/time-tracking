# 0016 — Absence notices: manual entry, per-viewer seen state

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Michal Lénert
- **Related:** US-105…US-112, [`docs/reference/features.md`](../reference/features.md), [`constitution.md §3`](../constitution.md)

## Context

The team needs a place to record which days a member won't be available, so
that whoever plans the week can open one page on Monday morning and see it.
The request came with three hard points and a one-hour build budget:

1. Report absences **at least one day ahead**; longer holidays **at least a
   month ahead** ("pls" — a request, not a gate).
2. **Web only.** The Chrome extension deliberately does not get this feature.
3. A **new-entry indicator** that disappears once the reader has physically
   opened the entry, or explicitly clicked that they've seen it.

Point 3 is the interesting one: "seen" is not a property of the absence, it is
a property of the (absence, reader) pair. Two admins must not clear each
other's indicator.

## Decision

Absences are **entered manually** in a new `/absence` section of the web app,
stored as `Absence` rows with bare `@db.Date` start/end days, and acknowledged
through a separate `AbsenceRead` join table keyed `(absenceId, userId)`.

The one-day lead time is **enforced** (`too_late`, nothing written). The
one-month lead time for longer holidays has **no implementation at all**: it
survives as hint text under the form and nothing else.

That second half was reversed during review. It first shipped as an advisory
`shortNotice` flag — the row saved, plus a "Pozdě nahlášeno" chip in the
admin's list and a warning after saving — on the reasoning that a hard gate
would also block a genuine sick day. The requester saw it and asked for the
flag to be removed outright, so the concept is gone: no chip, no warning, no
computation, and US-107 is retired in the trace tracker. Reporting late now
looks exactly like reporting early.

### Health data stays out of the audit log

`kind` includes `sick` and `doctor`, and the free-text note can say anything, so
an absence's _reason_ is health-adjacent personal data. Audit rows are immutable
(constitution §3), outlive the absence they describe, and every admin can read
them at `/audit` — a permanent, un-erasable record of who was ill and why is not
something this feature needs in order to be accountable. So the audit payloads
carry only the owner and the affected days: enough to answer "who moved which
notice, when", nothing about the diagnosis. The reason is still visible to
admins on `/absence` for as long as the absence row itself exists, which is what
was asked for.

### One write cap

`createAbsence` refuses more than 20 notices per author per hour, counted off
`absences.created_at`. It is the only unbounded write path the feature adds, and
nobody plans twenty absences by hand in an hour — the cap exists for a runaway
client or a script, not for users.

## Alternatives considered

### Alternative A — Sync from Google Calendar instead of manual entry

The brief left the choice open ("napoj tam třeba svůj kalendář, nebo to
zadávej manuálně, to záleží na tobě"). Rejected for v1: it needs an OAuth
client, per-user token storage, a refresh path, and a convention for which
events count as an absence — none of which fits the stated one-hour budget,
and all of which would sit on top of exactly the data model built here. A
calendar import can be added later as a writer into the same `Absence` table
without touching the read side. That is the follow-up below.

### Alternative B — A `seenAt`/`seenBy` column on `Absence`

One column, no join table, cheaper reads. Rejected because it collapses the
per-reader semantics: the first admin to open an entry would clear the
indicator for everyone else, which is precisely the behaviour the brief rules
out. It also loses the "who acknowledged what" record for free.

### Alternative C — Reuse `TimeEntry` with a reserved client/project

Zero schema change. Rejected because absences would then pollute every report,
dashboard fund calculation and export in the app, all of which sum
`TimeEntry` durations. An absence has no duration in hours; it is a calendar
fact.

## Consequences

### Positive

- Per-viewer seen state is exact, and an edit can re-notify by deleting the
  `AbsenceRead` rows — a one-line operation.
- `@db.Date` storage means an absence cannot shift a day when the server runs
  in UTC and the user is in Europe/Prague (constitution §4).
- The lead-time arithmetic lives in `@tt/shared` as pure functions with no
  clock access, so it is unit-tested without a database.

### Negative

- The month-ahead expectation is now social, not enforced or even surfaced —
  nothing in the app distinguishes a holiday filed a day ahead from one filed
  in April. If that turns out to matter, the flag is a pure function of
  (filed-on, start, end) and can come back without a migration.
- The audit log cannot answer "was that absence sick leave or a holiday?" after
  the fact. That is deliberate (see above); if a payroll process ever needs it,
  it needs its own retention decision, not a quiet re-widening of the audit row.
- Acknowledging an absence (`markAbsenceSeen`) writes a row **without** an
  audit row, which is a deliberate exception to constitution §3's "every
  mutation produces exactly one audit row". The rationale: an `AbsenceRead` is
  the reader's own view state, not company data — auditing it would add one
  audit row per admin per notice and drown the log that §3 exists to protect.
  Every mutation of the absence itself (create/update/delete) does audit.
- The badge is computed on every authenticated page render (one indexed
  `count`). Acceptable at this scale; if it shows up in traces, cache it on
  the session.

### Neutral

- Members see only their own absences; admins see the company. There is no
  `manager` role yet, so "who may read the company's absences" is `admin`.

## Follow-ups

- [ ] Optional Google Calendar import writing into `Absence` (Alternative A).
- [ ] Consider a weekly digest e-mail if the badge proves too passive.
