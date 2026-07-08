# Gotchas

Append-only log of 20-minute-surprise bugs, integration quirks, and other unexpected things we want future us (and future LLMs) to find before re-debugging.

## Format

```
### YYYY-MM-DD — Short symptom

**Symptom.** What you observed.

**Cause.** What was actually wrong (root cause, not the proximate fix).

**Fix.** What you changed. Include file paths so the change is recoverable.

**See also.** ADR / commit / task link, if any.
```

## Rules

- Append at the **bottom**. Don't reorder by date — chronological matches commit order.
- One entry per surprise. Don't bundle unrelated symptoms.
- Don't edit existing entries. If you learned more later, append a new entry referencing the original.

---

<!-- Append entries below this line. -->

### 2026-06-01 — PDF shows blank/□ for Czech characters

**Symptom.** Generated PDF renders rectangles or blank boxes wherever Czech diacritics appear (ř, ě, ů, č, š, ž, …). All ASCII characters display correctly.

**Cause.** Standard PDF base-14 fonts (Helvetica, Times, Courier — all WinAnsi encoded) do not cover the Latin Extended-A block that Czech diacritics live in. pdfmake falls back to a replacement glyph when a code point is missing from the active font.

**Fix.** Embed a Unicode TTF that covers the full Czech range. We use DejaVu Sans (OFL-licensed, full Czech coverage): `apps/web/src/assets/fonts/DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`. The font is loaded via `fs.readFileSync` at `process.cwd()` and registered with `PdfPrinter`. In the standalone Next.js build, the font files must be listed in `outputFileTracingIncludes` in `next.config.mjs` or they will not be copied and the PDF route will crash with `ENOENT` at runtime. If the standalone build still can't find the files, fall back to embedding the TTF as a base64 string in a `.ts` module so it is bundled directly.

**See also.** ADR-0010 (`docs/decisions/0010-pdfmake-for-pdf-export.md`).

### 2026-06-05 — auto-stack e2e fails every morning (Prague), passes in the evening

**Symptom.** `apps/web/tests/e2e/auto-stack.spec.ts` US-65, US-67/68, US-69, US-75 fail in CI with `expect(...).toBeVisible()` timeouts — the overlap dialog never opens and the manual form never closes (lines 133/157/185/216). The _same commit_ passes when re-run later in the day. Because the Coolify deploy is gated on the full CI job, this silently blocks deploys of unrelated changes.

**Cause.** The tests hardcoded a candidate entry of 09:30–10:30 (today). The app rejects entries whose `endedAt` is more than 60s in the future (`apps/web/src/lib/services/time-entries.ts:62` and `apps/web/src/lib/services/auto-stack.ts:59`, `FUTURE_GRACE_MS = 60_000`). The e2e timezone is pinned to Europe/Prague (commit `f40581c`), so when CI runs before ~10:29 Prague the 10:30 end is in the future → the manual-create path returns `future_timestamp` and the auto-stack path throws `CandidateEndsInFutureError`, so the expected dialog / form-close never happens. Evening runs pass because 09:30–10:30 is then in the past. US-76 is immune — its stop-timer path sets `endedAt = now`, never the future.

**Fix.** Derive the overlap window from `now` so the candidate always ends in the past, via the `pastOverlapWindow()` helper in `apps/web/tests/e2e/auto-stack.spec.ts` (seed `[now-120m, now-60m]`, candidate `[now-90m, now-30m]`). Robust at any run time except ~00:00–02:00 Prague, which would cross midnight.

**See also.** Commits `f40581c`, `35d58a7` — earlier attempts to stabilize the same suite by pinning TZ and widening timeouts (symptom, not the future-timestamp root cause).

### 2026-07-08 — `ALTER TYPE … ADD VALUE` fails inside a Prisma migration transaction

**Symptom.** Adding a value to a Postgres enum and using it in the same
migration aborts with `unsafe use of new value of enum type`.

**Cause.** Postgres will not let a newly-added enum value be _used_ in the same
transaction that adds it. Prisma wraps each migration in a transaction.

**Fix.** Adding the value alone is fine (that is all
`add_purge_audit_action` does). If a migration ever needs to add a value _and_
write rows using it, split it into two migration files.

### 2026-07-08 — `absolute inset-0` inside a document-tall `relative` root

**Symptom.** The Chrome extension's edit sheet opened with its header and title
field above the fold; scrolled down, the first visible element was the
description textarea.

**Cause.** `AppShell`'s root is `relative` and grows to the full document height
(header + lists + entire history). `absolute inset-0` therefore spans the whole
document, not the popup viewport. The sheet's inner `overflow-y-auto` also never
scrolled, because its flex parent had no bounded height.

**Fix.** `fixed inset-0` (which `AutoStackSheet` already used), plus
`min-h-0 flex-1` on the inner scroller and a body scroll lock. A flex child's
default `min-height: auto` refuses to shrink below its content — without
`min-h-0`, `overflow-y-auto` is inert.

### 2026-07-08 — `catch` around a Server Action swallows `redirect()`

**Symptom.** Wrapping a Server Action call in `try/catch` on the client makes
`redirect()` inside that action stop working. The user sees the catch branch's
error message instead of being navigated.

**Cause.** `redirect()` does not navigate from the server. Next rejects the
client-side action promise with a redirect error so `RedirectBoundary` can
handle it — see `next/dist/client/components/router-reducer/reducers/server-action-reducer.js:250`,
`reject(getRedirectError(...))`, whose own comment says so. A `catch` therefore
intercepts control flow, not just failure. `notFound()`, `forbidden()` and
`unauthorized()` behave the same way.

**Fix.** Call `unstable_rethrow(err)` from `next/navigation` as the **first**
statement of the `catch`. It re-throws Next's control-flow digests and returns
for everything else, so genuine errors still reach your handler. Despite the
prefix it is public API: `next/navigation.d.ts` is a one-line re-export
(`export * from './dist/client/components/navigation'`), and it's that target,
`next/dist/client/components/navigation.d.ts:126`, that lists `unstable_rethrow`
in the public export statement, in 15.1.3.

This bit us in `TimerLists.tsx`'s undo handler: `requireActiveCompany()` calls
`redirect('/companies')` when the session expires, and the undo window stays open
for ten seconds — a realistic window for that to happen.
