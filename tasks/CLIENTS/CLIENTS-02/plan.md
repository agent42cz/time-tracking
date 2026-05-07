# CLIENTS-02 — Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SearchInput` primitive to `@tt/ui` — a controlled text input with a magnifier icon, an inline clear button, and Esc-to-clear behavior. Visually consistent with the existing `Input` primitive, dark-mode aware.

**Architecture:** Single component file in `packages/ui/src/`, re-exported from `packages/ui/src/index.ts`. Reuses the existing `Input` styling string for visual consistency, then adds left padding for the icon and right padding for the clear button. Inline SVG for the icon (no icon dependency).

**Tech Stack:** React 19, Tailwind, no test runner in `@tt/ui` today (see deviation).

**Spec deviation:** `assignment.md` calls for React Testing Library tests in `packages/ui/src/SearchInput.test.tsx`. The `@tt/ui` package has no vitest, jsdom, or RTL configured today and `apps/web`'s vitest runs in node env without jsdom (`apps/web/vitest.config.ts:5`). Setting up component-test infrastructure for one primitive adds 5+ devDependencies and a new vitest config — disproportionate. Behavior is fully covered by Playwright in [CLIENTS-05](../CLIENTS-05/assignment.md) (typing fires changes, clear button, Esc clears, ariaLabel forwarded). Plan ships the primitive without unit tests; CLIENTS-05's E2E tests serve as the regression net. If a future task adds component-test infra to `@tt/ui`, retrofitting unit tests for SearchInput is trivial.

**Spec:** [`assignment.md`](assignment.md)

---

## File structure

| File                               | Status | Responsibility          |
| ---------------------------------- | ------ | ----------------------- |
| `packages/ui/src/search-input.tsx` | Create | The primitive component |
| `packages/ui/src/index.ts`         | Modify | Re-export `SearchInput` |

Filename uses kebab-case to match siblings (`confirm-modal.tsx`, `empty-state.tsx`).

---

## Task 1: Build the `SearchInput` primitive

**Files:**

- Create: `packages/ui/src/search-input.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Create the component file**

`packages/ui/src/search-input.tsx`:

```tsx
'use client';

import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import { cn } from './cn.js';

const wrapper = 'relative w-full';

const inputBase =
  'block w-full rounded-md border border-zinc-200 bg-white pl-9 pr-9 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ' +
  'focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 ' +
  'disabled:bg-zinc-50 disabled:text-zinc-500 disabled:cursor-not-allowed ' +
  'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 ' +
  'dark:focus:border-zinc-100 dark:focus:ring-zinc-100/10 ' +
  '[&::-webkit-search-cancel-button]:hidden';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  clearAriaLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  ariaLabel,
  clearAriaLabel,
  placeholder,
  autoFocus,
  className,
}: SearchInputProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape' && value.length > 0) {
      e.preventDefault();
      onChange('');
    }
  }

  function handleClear(): void {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <div className={cn(wrapper, className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="9" cy="9" r="6" />
        <line x1="14" y1="14" x2="18" y2="18" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={inputBase}
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearAriaLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Re-export from the package barrel**

In `packages/ui/src/index.ts`, add the export alongside the others:

```ts
export { SearchInput, type SearchInputProps } from './search-input.js';
```

- [ ] **Step 3: Typecheck the package**

```bash
pnpm --filter @tt/ui typecheck
```

Expected: no errors.

- [ ] **Step 4: Typecheck the consumer**

```bash
pnpm --filter @tt/web typecheck
```

Expected: no errors. (No consumer wires it up yet — [CLIENTS-03](../CLIENTS-03/assignment.md) does — but the export must compile cleanly.)

- [ ] **Step 5: Lint the consumer**

```bash
pnpm --filter @tt/web lint
```

Expected: no errors.

- [ ] **Step 6: Visual smoke (optional but recommended)**

Drop the component into a one-off route (e.g., `apps/web/src/app/(authenticated)/clients/page.tsx`'s top of CardBody) for a manual sanity check that the icon and clear button render correctly in both themes, then revert. Do NOT commit the smoke.

```tsx
import { SearchInput } from '@tt/ui';
// inside CardBody:
<SearchInput
  value=""
  onChange={() => undefined}
  ariaLabel="Test"
  clearAriaLabel="Vymazat"
  placeholder="Type something"
/>;
```

Boot dev with `pnpm --filter @tt/web dev`, visit `/clients`, verify icon + input render, then revert.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/search-input.tsx packages/ui/src/index.ts
git commit -m "feat(ui): SearchInput primitive with icon, clear button, and Esc-to-clear"
```

---

## Verification summary

After this task:

```bash
pnpm --filter @tt/ui typecheck && pnpm --filter @tt/web typecheck && pnpm --filter @tt/web lint
```

All exit 0. The component exists in `@tt/ui` and is ready for consumption by [CLIENTS-03](../CLIENTS-03/assignment.md). Behavior coverage (typing, Esc, clear button, ariaLabel forwarding) lives in [CLIENTS-05](../CLIENTS-05/assignment.md)'s Playwright suite.

## Changelog

Filled in after merge in [`changelog.md`](changelog.md).
