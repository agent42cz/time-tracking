# 0007 — `@dnd-kit` for client / project reordering

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** Mišal Lenert
- **Related:** [`tasks/CLIENTS/`](../../tasks/CLIENTS/), CLIENTS-04

## Context

The CLIENTS epic (US-52, US-53) introduces drag-and-drop reordering for clients and projects on `/clients`. The constitution ("Tech stack is locked") requires an ADR before adding a runtime dependency outside the established set.

The reorder UI must be:

- Touch-capable (admins occasionally manage on phones during meetings).
- Keyboard-accessible (a11y is a constitution requirement).
- React 19-compatible (current app).
- Cheap on bundle size — the page is admin-only and not on the critical path, but ~10 KB gz is the soft ceiling for a single feature.

## Decision

Add `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` (combined ~12 KB gz) as runtime dependencies of `apps/web`. Use them as the only DnD library in the codebase.

## Alternatives considered

### Alternative A — `react-beautiful-dnd`

Battle-tested API and ergonomic, but officially unmaintained since 2022. Doesn't play well with React 18+ Strict Mode without community patches; React 19 support is similarly community-driven. Adopting an unmaintained library would lock us into a dead-end dependency.

### Alternative B — Native HTML5 drag-and-drop

Zero-dep but painful with touch (HTML5 drag does not generate `dragstart` on iOS Safari without polyfills), no built-in keyboard support, and `aria-live` announcements would have to be hand-rolled. The cost-benefit is poor for the size of the savings (~12 KB).

## Consequences

### Positive

- ~12 KB gz bundle cost only on `/clients` (admin route, no user-facing impact).
- Keyboard reordering and `aria-live` announcements come for free.
- `PointerSensor` activation distance prevents accidental drags from button taps without per-button event-stop boilerplate.
- Active maintenance, ecosystem support, ships React 19-compatible.

### Negative

- One more dependency to keep upgraded.
- The library's API surface is larger than what we use; future contributors may use unfamiliar patterns from its docs.

### Neutral

- DnD is now a "real" capability in the codebase. Future surfaces (members ordering, dashboard widget order, etc.) will reuse this library by default.

## Follow-ups

- None.
