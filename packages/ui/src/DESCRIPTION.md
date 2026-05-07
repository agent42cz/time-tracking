# `packages/ui/src`

> Shared React primitives consumed by both the Next.js web app and the Chrome-extension popup. Tailwind + `clsx` + `tailwind-merge` only.

## Purpose

A small inventory of generic, accessible React components — the kind of primitives that would otherwise drift between web and extension. Components here have no awareness of Next.js or Chrome APIs; they only render JSX and forward props.

## Public surface

| Component                                                   | File                | Purpose                                                                                                                            |
| ----------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `cn`                                                        | `cn.ts`             | `clsx` + `tailwind-merge` helper for conditional classNames. Every component uses it.                                              |
| `Button`                                                    | `button.tsx`        | Primary / secondary / ghost / destructive variants. Forwarded ref.                                                                 |
| `Input`, `Textarea`                                         | `input.tsx`         | Form controls with consistent ring + focus styling.                                                                                |
| `Label`                                                     | `label.tsx`         | Form labels (`<label htmlFor>`).                                                                                                   |
| `Card`, `CardHeader`, `CardTitle`, `CardBody`, `CardFooter` | `card.tsx`          | Composable card surface.                                                                                                           |
| `Field`, `FieldGroup`                                       | `field.tsx`         | Label + control + error wrapper for forms.                                                                                         |
| `Badge`                                                     | `badge.tsx`         | Small pill for tags, statuses.                                                                                                     |
| `Table`, `THead`, `Th`, `Tr`, `Td`                          | `table.tsx`         | Tailwind-styled table primitives — used by reports, audit, trash.                                                                  |
| `EmptyState`                                                | `empty-state.tsx`   | "No data" placeholder with optional CTA.                                                                                           |
| `Alert`                                                     | `alert.tsx`         | Inline alert (info / warning / error).                                                                                             |
| `Select`                                                    | `select.tsx`        | Native `<select>` styled to match the rest of the system.                                                                          |
| `ConfirmModal`                                              | `confirm-modal.tsx` | Accessible confirm dialog used for destructive actions (archive, delete). Marked `'use client'` because it owns interactive state. |

## Package exports

`package.json` exposes:

- `.` — barrel re-export of every component.
- `./*` — direct subpath import per component (`@tt/ui/button`, `@tt/ui/card`, etc.) for narrow tree-shaking.

## Dependencies

- **Internal:** none.
- **External:** `clsx`, `tailwind-merge`. **Peer:** `react`, `react-dom` >= 19.

## Used by

- `apps/web` — every page composes from these primitives; only web-specific components live in `apps/web/src/components/`.
- `apps/extension` — popup shares the same primitives so the design language stays consistent across surfaces.

## Notes

- **Tailwind-only styling.** No styled-components, no emotion, no CSS modules. The web app and the extension both load Tailwind, so utility classes resolve consistently.
- **Design tokens are inline.** No central token file yet — colors and sizes live as Tailwind utility classes in each component. The dominant palette is `zinc-*` with semantic accents. If a token-file refactor becomes useful, write an ADR before doing it.
- **Server-Component-friendly.** Most components are simple enough to render on the server. `ConfirmModal` and any future component that owns interactive state is marked `'use client'`.
- **Accessibility.** Components forward refs and accept native HTML attributes. Don't strip `aria-*` props or replace native semantics with `<div onClick>`.
