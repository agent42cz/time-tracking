# ABSENCE-01 — "Nepřítomnost" section in the web tracker

## What

A new web-only section where a member reports the days they won't be available,
and whoever plans the week sees it — with an unread indicator that clears once
the reader has actually looked at the entry.

## Why

Verbatim from the brief (2026-08-13):

> Potřeboval bych, abys mi hlásil, které dny tady nebudeš dříve než 1 den předem. […]
> Přidej do webového trackeru sekci „Nepřítomnost" (do extension to nedávej, tam to
> nepotřebuju). Napoj tam třeba svůj kalendář, nebo to zadávej manuálně, to záleží na
> tobě. […] V pondělí ráno se chci kouknout, jak budeš/nebudeš k dispozici ten týden.
> Delší dovolené tam pls dávej alespoň měsíc předem. Pokud tam něco přidáš, chci tam
> vidět nějakou ikonku / notifikaci, že tam je nový zápis. Až to já tu položku fyzicky
> otevřu / nebo odkliknu, že jsem to viděl, tak ikonka / notifikace zmizí.

Time budget: **1 hour**.

## Acceptance criteria

- [x] `/absence` section in the web app, in the sidebar and the mobile tab bar. **Not** in the extension.
- [x] Manual entry: day range + reason (Dovolená / Nemoc / Lékař / Osobní volno / Jiné) + optional note.
- [x] A notice must be filed at least **one day** before its first day — enforced server-side (`too_late`), not just in the date picker.
- [x] ~~A **5+ day** absence filed less than **30 days** ahead is saved and flagged "Pozdě nahlášeno".~~ Built, reviewed, then **removed at the requester's direction**. Absence length no longer affects anything; the month-ahead ask lives only as hint text under the form.
- [x] **Monday-morning week view**: the seven days of a week, one row per absent member, with prev/next week navigation.
- [x] **Unread indicator**: a count badge on the nav item, a dot on the row, cleared per viewer by opening the row or by "Označit vše jako přečtené". Another admin's badge is unaffected.
- [x] Editing an absence re-notifies (clears everyone's seen state).
- [x] Cross-company 404 on every operation; one audit row per absence mutation.

## Out of scope

- Google Calendar sync. The brief left the choice open ("kalendář, nebo manuálně"); manual entry was chosen for the time budget and because a calendar import would write into the same table later. See [ADR-0016](../../../docs/decisions/0016-absence-notices-manual-entry-and-per-viewer-seen-state.md).
- Half-day / hour-level absences. Absences are whole calendar days.
- Approval workflow — this records a fact, it does not request permission.
- E-mail or push notification. The badge is the notification.
- Extension parity (explicitly excluded by the brief).

## Deviations from the brief

**The one-month rule has no implementation.** It was first built as an advisory
flag rather than a hard gate — blocking would also block a real sick day, which
is the opposite of what a reporting tool should do. On review the requester
asked for the flag itself to go, so the whole concept was removed: no chip, no
post-save warning, no computation, and US-107 retired in the trace tracker.
Reporting a holiday a day ahead is now indistinguishable from reporting it in
April. Bringing it back needs no migration — it is a pure function of
(filed-on, start, end).

## Dependencies

None.
