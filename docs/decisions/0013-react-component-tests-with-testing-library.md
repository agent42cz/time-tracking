# 0013 — `@testing-library/react` + jsdom for React component tests

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Claude Code (AIAGE-57)
- **Related:** US-102, US-103, Task 10 / Task 13 of `docs/superpowers/plans/2026-07-27-aiage-57-timer-feature.md`, [`../constitution.md`](../constitution.md) §1/§2

## Context

`docs/constitution.md:16` locks the test stack to "Vitest + testcontainers-node for
tests, Playwright for E2E — no Jest, Mocha, Cypress." Until AIAGE-57 Task 10, every
test under `apps/web` fit that sentence without qualification: `apps/web/vitest.config.ts`
ran with `environment: 'node'` because every existing test exercised a service, an
action, or a route handler — real Postgres via testcontainers, no DOM anywhere.

Task 10 built `ClientName` (US-102): a component whose entire behavior is which CSS
custom properties (`--tint-light`, `--tint-dark`) and which class (`client-tint`) it
sets on an element, so a stylesheet loaded elsewhere in the app can resolve those into
an actual `color`. That behavior:

- **Cannot be tested at the service layer** — there is no service call; it is pure
  rendering logic.
- **Is the wrong grain for Playwright** — `client-color.spec.ts` already exists and
  proves the resolved colour end-to-end in a real, styled browser, but writing every
  variant (neutral default, missing client, palette edge cases) as a full E2E test
  means a `next start` + real Postgres + real browser round trip for what is, in each
  case, one component's prop-to-attribute mapping. Task 13 hit the same shape again
  with `TimerLists.test.tsx` (US-103): proving that a stale-stop click is blocked
  _before_ the mutation fires needs a mocked `fetch` and a mocked server action —
  something a real Postgres-backed E2E run would rather use its budget on.

Testing either component against real DOM output needs a DOM. Vitest does not ship
one; the ecosystem's default answer for "render a React component and assert on it"
is `@testing-library/react` over `jsdom`, and that is what a Jest→Vitest migration
guide would recommend verbatim.

## Decision

Add `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as
`apps/web` devDependencies (React-19-compatible versions), and add
`esbuild: { jsx: 'automatic' }` to `apps/web/vitest.config.ts` so `.tsx` test files
compile the way Next actually compiles them. Component tests opt into a DOM per file
via a `// @vitest-environment jsdom` docblock rather than a global
`environment: 'jsdom'` — the vast majority of tests in this project are
Postgres/Redis-backed integration tests that should keep running under plain Node
with no jsdom globals in scope.

The runner stays Vitest. This is not the swap the constitution's line 16 forbids —
no Jest, no Mocha, no Cypress — it is Vitest gaining a rendering capability it did
not have before, the same way it already gained `testcontainers-node` for real
Postgres/Redis. The constitution's own remedy for a stack addition is an ADR, so
this is that ADR rather than a silent `pnpm add`.

## Alternatives considered

### Alternative A — No component tests; rely on the existing Playwright E2E spec

`client-color.spec.ts` already proves the resolved colour in a real browser.
Rejected: it cannot economically cover every branch (default colour, missing
client, off-palette input, StrictMode double-invoke of an effect) without either a
combinatorial explosion of E2E specs or overloading one spec with unrelated
assertions — each of which pays the cost of a full `next start` + seeded Postgres.
`TimerLists.test.tsx`'s "stale-stop guard" case needs a mocked `fetch` returning a
crafted stale response, which is not something a real backend will do on demand.

### Alternative B — Test the pure logic only, skip rendering

Extract the colour-resolution math into a plain function and unit-test that,
leaving the JSX untested. Rejected: for `ClientName`, the logic _is_ "does this
render set this custom property on this element" — extracting it into a
non-rendering function would just re-implement React's own prop-to-DOM mapping by
hand and test the reimplementation instead of the component. For `TimerLists`, the
behavior under test (a stop click being blocked, a notice appearing) only exists as
an effect of rendering plus a user event; there is no non-React function to extract
it into.

## Consequences

### Positive

- `ClientName.test.tsx` and `TimerLists.test.tsx` test exactly the layer that was
  previously untestable: component output, not service output and not full-browser
  output — closing the gap between service-layer unit tests and Playwright E2E.
- The pattern (`@vitest-environment jsdom` per file, `afterEach(cleanup)`,
  `esbuild.jsx: 'automatic'`) is now established for the next component that needs
  it, including the three gotchas documented in `docs/gotchas.md`'s 2026-07-27
  entry (missing deps, classic-vs-automatic JSX runtime, `toHaveStyle` reading
  computed style instead of custom properties).

### Negative

- A second test "mode" now exists in `apps/web`: node-environment integration tests
  against real Postgres, and jsdom-environment component tests with everything
  mocked. A contributor has to know which one a new test needs and reach for the
  right docblock.
- jsdom has no real CSS engine — these tests can only assert on the custom
  properties/classes a component sets, never the resolved `color` a stylesheet
  produces. That gap is intentional (see Context) but means a component test alone
  is never sufficient proof that a feature _looks_ right; the paired Playwright
  spec still carries that burden.

### Neutral

- **This does not relax "real Postgres, zero DB mocks."** Every one of these
  component tests mocks the server action / `fetch` boundary and never talks to a
  database — that boundary is exactly what makes them component tests rather than
  integration tests. Any test that touches `TimeEntry`, `Client`, or any other
  Prisma model still goes through testcontainers-node with a real Postgres, same as
  before this ADR. `docs/constitution.md` §2's "zero DB mocks" rule is about the
  database specifically, not about mocking a server action from a component test.

## Follow-ups

- [ ] None currently planned — extend this pattern to future components whose
      entire contract is DOM output, rather than reaching for a Playwright spec by
      default.
