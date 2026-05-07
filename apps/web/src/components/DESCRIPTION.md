# `apps/web/src/components`

> Web-only React components shared across pages. Anything reusable across web _and_ extension goes in `packages/ui` instead.

## Purpose

Components that are specific to the Next.js web app — they consume web concepts (`next/link`, `next/navigation`, server actions, cookies) and are not portable to the Chrome extension. Generic primitives (Button, Input, Card, Badge, etc.) live in [`packages/ui`](../../../../packages/ui/src/DESCRIPTION.md) and are imported here.

## Public surface

| Component             | Purpose                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CompanySwitcher.tsx` | Dropdown for switching the active company; posts to a server action that updates the session cookie. Used in the authenticated layout's sidebar. |
| `FaviconSwitcher.tsx` | Swaps `<link rel="icon">` based on whether any timer is running. Pulls running-timer state from the server.                                      |
| `LogoutButton.tsx`    | Button posting to the logout server action; invalidates the session server-side.                                                                 |
| `MultiSelect.tsx`     | Multi-select input with Czech labels. Used by the reports filter matrix.                                                                         |
| `PageHeader.tsx`      | Standard page heading + subtitle wrapper. Keeps spacing consistent across `/timer`, `/timesheet`, `/dashboard`, `/reports`, etc.                 |
| `ThemeToggle.tsx`     | Light/dark theme toggle persisted via cookie. Consumed by the sidebar header (compact variant) and (future) settings page.                       |

## Dependencies

- **Internal:** `@tt/ui` for primitives (`Button`, `Card`, `Field`, `Select`, etc.), `@/lib/actions/*` for server actions, `@/lib/session` for the active session.
- **External:** `next/link`, `next/navigation`, `react`, `next-intl` for translations.

## Used by

- The authenticated layout (`apps/web/src/app/(authenticated)/layout.tsx`) consumes `CompanySwitcher`, `FaviconSwitcher`, `LogoutButton`, `ThemeToggle`.
- Authenticated pages consume `PageHeader` and (the reports page) `MultiSelect`.
- Public pages (login, invite, reset) compose primitives from `@tt/ui` directly and don't depend on this folder.

## Notes

- Mark `'use client'` only when the component genuinely needs browser APIs or hooks. Server Components are the default and reduce bundle size.
- Czech UI: every visible string goes through `next-intl`. Don't hardcode Czech literals here — put keys in the message catalogue and translate at the call site.
- If a new component would be useful in both web and the extension, write it in `packages/ui` instead — this folder is for web-only deps.
