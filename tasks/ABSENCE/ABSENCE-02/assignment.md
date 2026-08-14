# ABSENCE-02 — Fixing a filed notice, and a readable date range

## What

Three corrections to the `/absence` list shipped in
[ABSENCE-01](../ABSENCE-01/assignment.md): a weekday on both ends of a
multi-day range, an inline **Upravit záznam** form, and the delete button
renamed from "Zrušit" to "Smazat".

## Why

Verbatim from the requester (2026-08-14):

> Když je Nepřítomnost další než jeden den, tak se vypisuje den v týdnu a datum
> začátku, ale už se nevypisuje den v týdnu konce, doplň to. […] tlačítko zrušit
> záznam, přejmenuj na smazat záznam. […] chybí tam tlačítko upravit záznam,
> Dnes jsem při zadávání nového záznamu udělal chybu v datumu, ale nemůžu ji
> opravit. Musel bych záznam pouze smazat a dát tam nový a to je nepraktické.

The reader plans around the day someone comes **back**, and `Čt 10.09.2026 –
15.09.2026` makes them work that out on a calendar. "Zrušit" reads like
cancelling the absence itself (as in "I'm coming to work after all") rather than
deleting the record. And `updateAbsence` already existed in the service layer
with tests — only the UI to reach it was missing.

## Acceptance criteria

- [x] A multi-day notice renders `Čt 10.09.2026 – Út 15.09.2026`; a one-day notice stays `Čt 10.09.2026`.
- [x] The delete button and its confirm dialog say **Smazat záznam** / **Smazat nepřítomnost?**; the pending label is "Mažu…".
- [x] An **Upravit záznam** button in the expanded row opens an inline form (Od / Do / Důvod / Poznámka) prefilled from the notice, saving through the existing `updateAbsenceAction`.
- [x] Edit is offered only to someone who may write the notice (its author, or an admin) and only while it has not started — `updateAbsence` re-checks the lead time, so an already-running notice could not be saved anyway.
- [x] A rejected save shows the service's Czech message in place; the form stays open with the entered values.
- [x] Everything else on `/absence` unchanged: week grid, create form, badge, per-viewer seen state, history list.

## Out of scope

- Relaxing the one-day lead-time rule so a running absence can be edited or extended. That is a rule change, not a UI gap — it would need its own decision.
- Any change to the audit payloads, the seen-state semantics (an edit still re-notifies everyone) or the 20/hour cap.
- E2E coverage for `/absence` — still the gap ABSENCE-01 recorded.

## Dependencies

[ABSENCE-01](../ABSENCE-01/assignment.md) (merged).
