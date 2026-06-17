# Auto-stack overlap resolution in the extension (+ manual start mode)

**Date:** 2026-06-17
**Status:** Approved (design), pending implementation plan
**US range:** US-77 … US-86 (extends the existing auto-stack range US-64 … US-76)

## Problem

The web app has an "auto-stack" feature (US-64 … US-76): when the user saves a
closed entry that overlaps another closed entry — including by **stopping a
running timer** — and the per-user setting `autoStackOverlaps` is ON, a preview
dialog (`AutoStackPreviewDialog`) opens offering **Forward** / **Backward**
rearrangement (or "save without shift").

The Chrome extension (`apps/extension`) has none of this. It stops a timer with
a bare `POST /api/v1/timer/{id}/stop` (empty body), never receives the
`autoStackOverlaps` setting (`/api/v1/me` doesn't return it), and uses REST
rather than the web's server actions — so it can't reuse the web's
server-action path.

We want the extension to offer the same overlap rearrangement on **stop** when
the setting is enabled. We also want a **new "manual start" mode** (in both web
and extension): the user types when their work actually started, and the
earlier overlapping ("blocker") entry **moves earlier, preserving its length**,
cascading into entries before it.

## Decisions (from brainstorming)

1. **Extension UX:** full preview dialog — parity with the web (Forward /
   Backward + "save without shift"), plus the new Manual tab.
2. **Offline-first model:** the stop **always commits as a plain stop first**.
   The server reports whether the just-closed entry overlaps. The extension
   shows the preview when online — immediately if the stop ran online, or
   deferred until reconnect if the stop was queued offline.
3. **Scope:** extension overlap handling is added to the **stop flow only**
   (not manual-create or edit) for now.
4. **Setting is read-only in the extension:** it respects the server's
   `autoStackOverlaps`; no extension toggle. The user manages the toggle in the
   web app.
5. **Manual mode reaches both clients:** built once in the shared server planner
   and surfaced in **both** preview dialogs (web + extension).

### Manual mode semantics (confirmed)

```
Before:
  Blocker  12:30 ───── 13:30
  You            13:00 ─── 14:00   (just stopped; ends "now")

User sets start = 13:00
After (MOVE blocker back, keep its 1h length):
  Blocker 12:00 ─── 13:00
  You           13:00 ─── 14:00
```

The candidate's `endedAt` (the stop time) stays fixed; its `startedAt` becomes
the user-chosen value; every earlier overlapping entry is compacted backward
preserving its duration.

## Architecture

### Why commit-then-resolve (and not the web's pre-commit flow)

The web app detects the overlap **before** committing (preview → dialog →
`saveEntryWithAutoStack` does the stop + shifts atomically). For the extension
we deliberately invert this: **the stop commits as a plain stop, then we
resolve.** This is the only model that behaves identically online and offline —
an offline stop is a queued plain mutation; only when it reaches the server can
the overlap be computed, so resolution is inherently after-the-fact. Keeping
the online path the same avoids two divergent code paths.

Consequence: the data may briefly hold an overlap until the user resolves or
dismisses the sheet — exactly like the web's existing "Uložit bez posunu"
(save without shift) outcome.

### Component map

```
Shared planner (apps/web/src/lib/services/auto-stack.ts)
  + new 'manual' direction, + manualStartedAt input         ← used by web & API

Save/preview service (apps/web/src/lib/services/auto-stack-save.ts)
  + 'manual' window handling (same-day, like backward)

REST API (apps/web/src/app/api/v1/...)
  • timer/[id]/stop  → returns overlap probe when setting ON
  • entries/[id]/auto-stack/preview  (new)
  • entries/[id]/auto-stack          (new)
  • me               → + autoStackOverlaps

Web dialog (AutoStackPreviewDialog.tsx)  + Manual tab + start input
Web actions (lib/actions/auto-stack.ts)  + 'manual' + startedAt

Extension (apps/extension/src)
  • api.ts        → read setting, stop returns overlap, preview/apply clients
  • AutoStackSheet.tsx (new)  → Forward / Backward / Manual sheet
  • sync.ts / popup.tsx       → open sheet on overlap; drain pending overlaps
  • storage: tt:pending-overlaps (new) for deferred (offline) resolution
```

## Detailed design

### 1. Shared planner — `manual` direction

`apps/web/src/lib/services/auto-stack.ts`:

- Extend `Direction` to `'forward' | 'backward' | 'manual'`.
- Add optional `manualStartedAt?: Date` to the `planAutoStack` input.
- **manual branch:**
  - Candidate position is fixed at `{ startedAt: manualStartedAt, endedAt: candidate.endedAt }` (the stop time stays). The candidate does **not** move.
  - Every other entry that overlaps the new candidate range (`endedAt > manualStartedAt` and `startedAt < candidate.endedAt`) is compacted backward, preserving its duration, anchored at `manualStartedAt` — reuse the existing backward "chain" cascade (descending `startedAt`, anchor each against the previous).
  - Shifts sorted descending by `after.startedAt` (like backward).
  - Degenerate case: if nothing overlaps the chosen start, no shifts and the candidate just takes the new `startedAt` (this is a legitimate edit, not a no-op).

Validation: `manualStartedAt` must be `< candidate.endedAt` and a valid date; the existing `CandidateEndsInFutureError` guard on `endedAt` still applies.

### 2. Save/preview service

`apps/web/src/lib/services/auto-stack-save.ts`:

- `computeWindow('manual', candidateStartedAt)` → same-calendar-day window as
  `backward` (so manual moves can't reach into earlier days and rewrite
  history). The window is computed from the candidate's **effective** start
  (the manual start), so the moved blocker stays inside the locked window.
- The existing `SELECT … FOR UPDATE` lock, re-read, `cascade_window_exceeded`
  edge-buffer check, audit writes, and realtime publishes all apply unchanged.
- A manual start that falls outside the day window (e.g., earlier than the
  start of the candidate's day) ⇒ `invalid_window` (mapped to a clear message).

### 3. REST API

**`POST /api/v1/timer/{id}/stop`** (extend `apps/web/.../timer/[id]/stop/route.ts`):
- Still stops the timer via the existing `stopTimer` service (plain stop).
- After commit, **if the user's `autoStackOverlaps` is ON**, run a cheap probe:
  load the just-closed entry, call `previewAutoStack` (kind `edit`,
  `direction: 'forward'`) and check `plan.shifts.length > 0 || candidate moved`.
  Return:
  ```json
  { "ok": true, "overlap": { "entryId": "...", "startedAt": "...", "endedAt": "..." } }
  ```
  or `{ "ok": true, "overlap": null }`.
- Setting OFF ⇒ always `overlap: null`; behavior identical to today.

**`POST /api/v1/entries/{id}/auto-stack/preview`** (new):
- Body: `{ "direction": "forward"|"backward"|"manual", "startedAt"?: ISO }`.
- Loads the entry as an `edit` candidate (its current `startedAt`/`endedAt`),
  calls `previewAutoStack`. For `manual`, the candidate's `startedAt` is
  replaced by the body `startedAt`.
- Returns the wire plan (`candidateAfter` + `shifts`, ISO strings), or an error
  code (`not_found`, `invalid_window`, `future_timestamp`,
  `cascade_window_exceeded`, `invalid_input`).

**`POST /api/v1/entries/{id}/auto-stack`** (new):
- Same body. Wraps `saveEntryWithAutoStack` (edit kind, optional
  `manualStartedAt`), applies atomically, returns the applied plan.

Both new routes follow the existing v1 conventions: `OPTIONS` CORS preflight,
`resolveApiSession` auth, cross-company **404** (`not_found`) with no existence
leak.

**`GET /api/v1/me`** (extend) and `ApiSession` (`apps/web/src/lib/api/auth.ts`):
- Add `autoStackOverlaps: boolean` to the `ApiSession` interface, the user
  `select`, and the `/me` JSON response.

### 4. Extension

`api.ts`:
- `MeResponse` gains `autoStackOverlaps`.
- `stopTimer()` returns `{ ok: true; overlap: OverlapInfo | null }` instead of
  `void`.
- New clients: `previewAutoStack(session, entryId, { direction, startedAt? })`
  and `applyAutoStack(session, entryId, { direction, startedAt? })`.

`AutoStackSheet.tsx` (new) — mirrors `AutoStackPreviewDialog`:
- Tabs: **Vpřed** (forward) / **Zpět** (backward) / **Ručně** (manual).
- Manual tab shows a start-time input (reuse `datetime.ts` ISO↔`datetime-local`
  helpers). Re-previews on change (debounced, like the web dialog's 200ms).
- Renders candidate-after row + one row per shift, "Posunout a uložit" and
  "Uložit bez posunu" (which just closes the sheet — the stop already
  committed) and "Zrušit".
- Hardcoded Czech strings (the extension has no i18n library), reusing the
  existing `cs.json` autoStack wording.

`sync.ts` / `popup.tsx`:
- `executeStop` keeps enqueuing a plain `stopTimer`. When the **online** call
  returns `overlap != null`, surface the entryId to the popup, which opens the
  sheet.
- **Deferred (offline) resolution:** add a persistent `tt:pending-overlaps`
  list in `chrome.storage.local` (array of `{ entryId }`). When a queued
  `stopTimer` mutation replays and the response says `overlap != null`, push
  the entryId. The popup drains this list on mount / reconnect and opens the
  sheet for each. Re-running the preview is the source of truth: if the entry
  no longer overlaps (already resolved, deleted), the preview is empty and we
  drop the pending item silently.

`storage.ts`: new key constant `tt:pending-overlaps`.

### 5. Web parity for manual mode

- `lib/actions/auto-stack.ts`: `AutoStackActionInput` accepts `'manual'` and an
  optional `startedAt`; `VALID_DIRECTIONS` includes `manual`; pass through to
  the service.
- `AutoStackPreviewDialog.tsx`: third "Ručně" tab with a start-time input that
  re-previews on change.
- `apps/web/messages/cs.json` `autoStack`: add `directionManual` ("Ručně") and
  a manual helper/label string. No hardcoded JSX strings.

## Data flow

**Online stop, setting ON, overlap:**
`stop` (plain commit) → `{ overlap }` → open sheet → preview
(forward/backward/manual) → apply chosen → refresh timer + catalog.

**Offline stop:** `stop` queued → reconnect → replay `stop` → `{ overlap }` →
push to `tt:pending-overlaps` → popup drains → sheet → apply.

**Setting OFF:** no probe, no overlap payload, no sheet — byte-for-byte today's
behavior.

## User stories

- **US-77** — `GET /api/v1/me` returns `autoStackOverlaps`; the extension reads
  and stores it. `ApiSession` carries the field.
- **US-78** — Extension stop with the setting **OFF**: plain stop, `overlap:
  null`, no sheet — unchanged behavior.
- **US-79** — Extension stop with the setting **ON** and **no** overlap: plain
  stop, `overlap: null`, no sheet flash.
- **US-80** — Extension stop with the setting **ON** that **overlaps** a closed
  entry: the stop commits, the server returns the overlap payload, and the
  extension opens the preview sheet for the now-closed entry (edit candidate).
- **US-81** — The extension sheet offers Vpřed / Zpět / Ručně + "Uložit bez
  posunu"; confirming applies shifts preserving each duration and writes one
  audit row per shifted entry plus the candidate's `update` row.
- **US-82** — Manual mode: the user sets a start time; the earlier overlapping
  ("blocker") entry moves earlier preserving its duration (cascading into
  entries before it); the candidate's `endedAt` is unchanged and its
  `startedAt` becomes the chosen value.
- **US-83** — A stop performed **offline** is queued; on reconnect the replay
  detects the overlap, records it in `tt:pending-overlaps`, and the popup shows
  the preview sheet after coming online. Survives a browser kill mid-queue.
- **US-84** — The web `AutoStackPreviewDialog` gains a "Ručně" tab with a start
  input (parity); choosing it applies the same manual planner result.
- **US-85** — A cross-company entry id returns `not_found` (404) on both
  `/api/v1/entries/{id}/auto-stack/preview` and `/api/v1/entries/{id}/auto-stack`.
  No existence leak.
- **US-86** — A manual start time in the future, ≥ the candidate's `endedAt`, or
  outside the candidate's calendar-day window is rejected with a clear message
  and no mutation.

## Testing

- **Planner unit tests** (`auto-stack.test.ts`): manual move-blocker-back,
  multi-entry backward cascade under manual anchor, degenerate (no overlap),
  and window/future validation.
- **Integration tests** (real Postgres + Redis, testcontainers): the two new
  routes and the stop overlap probe; mandatory **cross-company 404s**;
  `auditCount` assertions (candidate `update` + one `shift` per moved entry);
  concurrent-save serialization still holds.
- **Extension tests:** `AutoStackSheet` preview/apply logic and the
  `tt:pending-overlaps` queue across a simulated browser kill (mirror
  `queue.test.ts`).
- `pnpm test:trace` must still hit 100% US coverage including US-77 … US-86.

## Out of scope

- Extension overlap handling for manual-create and edit flows (stop only).
- An extension-side toggle for `autoStackOverlaps` (read-only; managed in web).
- Porting the planner to run client-side/offline (server computes; offline is
  deferred).

## Risks / notes

- **Brief overlap window:** between the plain stop and the user's resolution,
  data can hold an overlap. Accepted; identical to the web's "save without
  shift" outcome.
- **Manual same-day constraint:** prevents the cascade from rewriting prior
  days; a manual start before the day boundary is rejected rather than silently
  clamped.
- **Two dialogs to keep in sync:** the web `AutoStackPreviewDialog` and the new
  extension `AutoStackSheet` share wording and behavior but are separate
  components (web has next-intl, the extension hardcodes Czech). Both must gain
  the Manual tab.
