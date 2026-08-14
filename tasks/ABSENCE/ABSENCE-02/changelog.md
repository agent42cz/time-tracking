# ABSENCE-02 — changelog

## Delivered

UI-only. No schema, no migration, no service or server-action change —
`updateAbsence` / `updateAbsenceAction` already existed and are unchanged.

### `apps/web/src/app/(authenticated)/absence/kinds.ts`

- New `formatDayRangeWithWeekday(start, end)` — weekday on both ends of the
  range, collapsing to one weekday + date when start equals end. The old
  `formatDayRange` stays as-is; the delete confirm dialog still uses it.

### `apps/web/src/app/(authenticated)/absence/AbsenceList.tsx`

- Row date line uses the new formatter (was: weekday of the start day only).
- Delete: "Zrušit záznam" → **Smazat záznam**, pending "Ruším…" → "Mažu…",
  confirm title "Zrušit nepřítomnost?" → "Smazat nepřítomnost?". The dialog's
  description and the Ponechat/danger behaviour are untouched.
- New `AbsenceEditForm` (same file, not exported): Od / Do / Důvod / Poznámka
  prefilled from the notice, `Uložit změny` / `Zpět`, service errors rendered in
  an `Alert` in place. Start-past-end drags the end along, same as the create
  form. Fields carry `htmlFor`/`id` pairs so the labels are real labels.
- `Upravit záznam` shows for the author or an admin, and only while
  `startDate >= minDate` — a started notice would be rejected by the lead-time
  check inside `updateAbsence`, so the button is not offered rather than
  offered-and-failing. Opening a different row closes the edit form.
- New required prop `minDate` (tomorrow in Europe/Prague, from the server).

### `apps/web/src/app/(authenticated)/absence/page.tsx`

- `minDate` computed once and passed to `AbsenceForm` and both `AbsenceList`s
  (the history list gets it too; every past notice fails the `>= minDate` test,
  so history stays read-only + deletable).

### Tests

`apps/web/src/app/(authenticated)/absence/AbsenceList.test.tsx` — 4 new jsdom
component tests: US-105 (weekday on both ends; one-day range unchanged),
US-110 (author edits a mistyped start date in place → `updateAbsenceAction`
called with the full patch), US-106 (a started notice offers Smazat but no
Upravit).

### Docs

- `docs/reference/features.md` — US-105 and US-110 extended for the range
  format and the inline edit.

## Verification

```
pnpm lint          # clean
pnpm typecheck     # clean
pnpm test:trace    # US coverage: 109/109 (100.0%, 3 retired)
vitest run src/app/(authenticated)/absence/AbsenceList.test.tsx   # 4 passed
vitest run src/app/(authenticated)/nav.test.ts                    # 14 passed
```

`apps/web/tests/services/absences.test.ts` was not re-run — it needs the
testcontainers Postgres, and nothing under `src/lib/` changed in this task.

## Deviations

- The confirm dialog **title** was renamed too ("Smazat nepřítomnost?"), which
  the brief did not ask for. A dialog headed "Zrušit…" over a button reading
  "Smazat záznam" would have read as two different operations.
- Editing a notice that has already started is not possible, so the requester's
  "opravil jsem se ve dnech, které už běží" case still needs delete + re-file.
  That follows from the existing lead-time rule; changing it is out of scope.
