# CLIENTS-02 — `SearchInput` primitive in `@tt/ui`

## What

Add a `SearchInput` component to `packages/ui` — a controlled text input with a magnifier icon, an inline clear button, and Esc-to-clear behavior. Visually consistent with the existing `Input` primitive, dark-mode aware, fully accessible.

## Why

Search is a recurring need on this codebase: members list, tags, audit log, and (immediately) the clients page in [CLIENTS-03](../CLIENTS-03/assignment.md) all benefit from a uniform search affordance. Building the primitive now in `@tt/ui` instead of inlining one in `ClientsManager.tsx` means the next surface to gain search reuses it instead of forking a slightly different version.

## Acceptance criteria

- [ ] `packages/ui/src/SearchInput.tsx` exports a `SearchInput` React component.
- [ ] `packages/ui/src/index.ts` re-exports it.
- [ ] Props (TypeScript):
  - `value: string` — required, controlled.
  - `onChange: (value: string) => void` — required.
  - `ariaLabel: string` — required, forwarded to the underlying `<input aria-label>`.
  - `clearAriaLabel: string` — required, forwarded to the clear button's `aria-label` so consumers control localisation.
  - `placeholder?: string` — optional, defaults to none (consumer provides via i18n).
  - `autoFocus?: boolean` — optional.
  - `className?: string` — optional, merged into the wrapper element.
- [ ] Renders an inline magnifier SVG on the left (no icon dependency added).
- [ ] Renders an `×` clear button on the right when `value.length > 0`. Click clears the value and refocuses the input. The button uses `aria-label={clearAriaLabel}`.
- [ ] Pressing `Esc` while the input is focused clears the value and calls `onChange('')`. (Native `<input type="search">` does this on macOS Safari but not Chrome/Firefox; we add a keydown handler so behavior is consistent across browsers.)
- [ ] `<input type="search" role="searchbox">`. Uses `type="search"` so the WebKit native clear button is suppressed (we render our own).
- [ ] Tailwind styling matches the existing `Input` (border, padding, focus ring) plus left padding for the icon and right padding for the clear button. Dark mode: same tokens as `Input`.
- [ ] Tests in `packages/ui/src/SearchInput.test.tsx` (React Testing Library) cover:
  - typing fires `onChange` with the new value;
  - clear button is hidden when value is empty;
  - clear button shows when value is non-empty;
  - clicking the clear button calls `onChange('')` and refocuses the input;
  - pressing `Esc` calls `onChange('')`;
  - `ariaLabel` reaches the underlying `<input>`.
- [ ] `pnpm --filter @tt/ui test && pnpm --filter @tt/ui typecheck && pnpm --filter @tt/ui lint` all green.

## Out of scope

- Internal debounce. Consumers wrap with their own if needed. The clients page uses synchronous client-side filtering at the size of typical lists, so debounce would only add lag.
- "No results" rendering. That's the consumer's job.
- Server-side search wiring. All search usage in [CLIENTS-03](../CLIENTS-03/assignment.md) is client-side.
- A standalone search button (form submission). The component is fire-on-each-keystroke only.

## Dependencies

None. This task and [CLIENTS-01](../CLIENTS-01/assignment.md) can run in parallel.

## Notes

- Keep the surface narrow. We're tempted to add `prefixIcon`, `loading`, `size` props — resist. If a future surface needs them, the primitive can grow then.
