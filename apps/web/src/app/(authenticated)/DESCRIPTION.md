# `apps/web/src/app/(authenticated)`

> Auth-gated route group. Every page below this folder requires a logged-in session and an active company.

## Purpose

This route group hosts the entire authenticated UI for the web app — every page from PRD §6.1 lives here. The group's `layout.tsx` is the shared chrome (sidebar nav, company switcher, user footer, mobile header). Each subfolder is a Next.js App Router route segment.

## Public surface

| Route        | Folder       | Audience                                                       |
| ------------ | ------------ | -------------------------------------------------------------- |
| `/timer`     | `timer/`     | All members — running timers, today's entries, quick-start row |
| `/timesheet` | `timesheet/` | All members — week list grouped by day                         |
| `/dashboard` | `dashboard/` | Admin — six KPI widgets, period selector                       |
| `/reports`   | `reports/`   | Admin — filter matrix, CSV/XLSX/PDF exports                    |
| `/clients`   | `clients/`   | Admin — client + project CRUD                                  |
| `/tags`      | `tags/`      | Admin (manage), User (view + inline create)                    |
| `/members`   | `members/`   | Admin — invite, role change, remove                            |
| `/audit`     | `audit/`     | Admin — firm-wide audit log with filters                       |
| `/trash`     | `trash/`     | Admin — soft-deleted entries, restore/purge                    |
| `/settings`  | `settings/`  | All — profile, password, 2FA, magic link                       |
| `/companies` | `companies/` | All — list, create, switch active                              |
| `/extension` | `extension/` | All — Chrome extension landing/instructions                    |

## Dependencies

- **Internal:** `@/lib/session` (auth gate), `@/components/*` (CompanySwitcher, FaviconSwitcher, LogoutButton, ThemeToggle), `./nav` (sidebar grouping helper).
- **External:** Next.js App Router (Server Components by default), Tailwind CSS, `next-intl` for Czech copy, `next/link` for navigation.

## Used by

The `(authenticated)` group is the entry point for every authenticated user-facing page. Public routes (`/login`, `/invite/[token]`, `/reset`, `/privacy`) live outside this group and have their own minimal layout.

## Notes

- **Tenant scoping is enforced at the data layer**, not in this folder. Every page calls services in `apps/web/src/lib/services/` which scope by `companyId` from the session and return 404 (not 403) for cross-tenant attempts. See [`docs/constitution.md`](../../../../../docs/constitution.md) §3.
- **`requireUser()`** in `layout.tsx` redirects to `/login` if no session. Pages can assume a valid session is present.
- **Sidebar grouping** is data-driven: `nav.ts` exports `navGroups` and `filterVisibleGroups(groups, isAdmin)`. Empty sections (after admin filtering) are dropped — see [`tasks/SIDEBAR/SIDEBAR-01/`](../../../../../tasks/SIDEBAR/SIDEBAR-01/).
- **Czech only** — all copy goes through `next-intl`. No English literals in JSX.
- **Server Components by default**; only mark a file `'use client'` when it needs hooks or browser APIs.
