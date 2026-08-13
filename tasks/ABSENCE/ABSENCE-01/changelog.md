# ABSENCE-01 — changelog

## Delivered

### Schema (`packages/db/prisma/schema.prisma`, migration `20260813082109_add_absences`)

- `AbsenceKind` enum — `vacation | sick | doctor | personal | other`.
- `Absence` — company + user scoped, `start_date` / `end_date` as bare `@db.Date`, note, timestamps.
- `AbsenceRead` — `(absence_id, user_id)` unique; per-viewer seen state.

### Rules (`packages/shared/src/absence/index.ts`)

Pure, clock-free day arithmetic: `validateAbsenceDates`, `absenceLengthDays`,
`leadDays`, `addDaysToDay`, `overlapsRange`. One constant:
`ABSENCE_MIN_LEAD_DAYS = 1`. Plus `appZoneDay()` / `appZoneWeekStartDay()` in
`packages/shared/src/time`.

### Service (`apps/web/src/lib/services/absences.ts`)

`createAbsence`, `updateAbsence`, `deleteAbsence`, `listAbsences`,
`listPastAbsences`, `countUnseenAbsences`, `markAbsenceSeen`,
`markAllAbsencesSeen`, `getWeekOverview`. Admin reads the company, a member
reads only their own rows; everything else is `not_found`.

### Actions + UI

- `apps/web/src/lib/actions/absences.ts` — server actions with Czech messages.
- `apps/web/src/app/(authenticated)/absence/` — `page.tsx`, `WeekGrid.tsx`,
  `AbsenceForm.tsx`, `AbsenceList.tsx`, `MarkAllSeenButton.tsx`, `kinds.ts`.
- Nav: `absence` icon, `/absence` item in Sledování, second slot in the mobile
  tab bar; badge rendering in the sidebar (`layout.tsx`) and `BottomTabBar`.

### Tests

- `packages/shared/src/absence/absence.test.ts` — 4 unit tests (US-105, US-106,
  US-111), including a DST-crossing day count.
- `apps/web/tests/services/absences.test.ts` — 8 integration tests against real
  Postgres (US-105, US-106, US-108 … US-112), with `auditCount` assertions and
  the mandatory cross-company 404 case.
- `apps/web/src/app/(authenticated)/nav.test.ts` — expectations updated for the
  11th nav item and the new bottom-bar order.

### Docs

- [ADR-0016](../../../docs/decisions/0016-absence-notices-manual-entry-and-per-viewer-seen-state.md) — manual entry, per-viewer seen state, and the audited-mutation exception for `AbsenceRead`.
- `docs/reference/features.md` — US-105 … US-112.
- `docs/reference/data-model.md` — entities + behaviour.
- `scripts/test-trace.ts` — `TOTAL_US` 104 → 112; US-107 added to `RETIRED`.

## Post-review changes

1. **Delete button** moved right, restyled `variant="danger"`, and gated behind
   the shared `useConfirm` dialog ("Zrušit nepřítomnost?" / Ponechat / Zrušit
   záznam).
2. **"Pozdě nahlášeno" removed entirely** at the requester's direction — chip,
   post-save warning and the `shortNotice` computation. US-107 retired.

3. **Security review fixes.** The clock (`today`) moved out of the
   client-supplied `input`/`patch` objects into a separate service parameter —
   a server action deserializes its arguments from the browser and TS types are
   erased at runtime, so a crafted `{ today }` key could backdate a notice past
   the lead-time rule. Audit payloads no longer carry `kind`/`note` (health
   data in an immutable, admin-readable log). `createAbsence` gained a 20/hour
   per-author cap. All three are covered by tests.

## Verification

```
pnpm lint          # clean
pnpm typecheck     # clean
pnpm test:trace    # US coverage: 110/110 (100.0%, 2 retired)
vitest run tests/services/absences.test.ts   # 11 passed
vitest run src/app/(authenticated)/nav.test.ts   # 14 passed
```

## Known gaps

- No E2E spec for `/absence` (the Playwright suite covers `/clients` only).
- The badge count runs on every authenticated render; it is a single indexed
  `count`, but it is not cached on the session.
