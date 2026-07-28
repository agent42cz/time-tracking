# 0015 — Serve `tags: []` as a compatibility shim for installed extensions

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Michal Lénert
- **Related:** AIAGE-57, [`0014-drop-unused-auth-js-dependencies.md`](0014-drop-unused-auth-js-dependencies.md)

## Context

AIAGE-57 removed tags from the whole system, including the `tags` key on
`/api/v1/catalog` and on the entry DTOs from `/api/v1/timer`. The extension was
updated in the same branch, and the branch merged as a unit — so within the
repository, nothing was ever inconsistent.

That reasoning missed the deployment topology. **The web app and the extension do
not ship together.** The web app deploys from `main` to Coolify in minutes; the
extension ships through the Chrome Web Store and reaches users only when a new
version is published _and_ Chrome updates their copy. Installed copies keep
calling the freshly-deployed API.

Version 1.6.1 — the published build — does:

- `apps/extension/src/popup.tsx:1119` — `catalog.tags.length > 0`
- `apps/extension/src/popup.tsx:1121` — `catalog.tags.map(...)`
- `apps/extension/src/popup.tsx:488` — `e.tags.map((t) => t.id)` in `openEdit`
- `apps/extension/src/EntrySheet.tsx:268,270` — the same `catalog.tags` reads

The extension parses responses into plain TypeScript interfaces with no runtime
validation, so an absent key is not a parse error — it is `undefined`, and the
crash happens at `.length` / `.map`. Deploying the tagless API broke the popup for
every installed extension.

A reviewer raised this exact risk during the branch's Task 2 review, as a
"⚠️ Cannot verify from diff" item, noting the extension would throw a `TypeError`
if the API shipped before the extension did. It was resolved as "the branch merges
as a unit, so no intermediate deploy risk" — correct about the repository, wrong
about the world.

## Decision

Serve `tags: []` from the two endpoints installed extensions read:

- `/api/v1/catalog` — top-level `tags` key, both the no-active-company early return
  and the normal response
- `/api/v1/timer` — `tags` on the running (`dto`) and history (`historyDto`) entry
  shapes

An empty array satisfies both crash sites: `catalog.tags.length > 0` is false, so
no tag UI renders, and `e.tags.map(...)` yields `[]`. Old extensions work with no
tag feature; new ones ignore the field.

This is a shim with an expiry, not a feature. It is marked as such at every site.

## Consequences

- Installed extensions work again without users updating anything, and without a
  Chrome Web Store review cycle in the critical path.
- The API carries a field that describes nothing. Every occurrence has a comment
  pointing here, so it is not mistaken for a live feature.
- Removal is gated on adoption, not on a date: once Chrome Web Store telemetry
  shows 1.6.2+ on effectively all installs, delete the four sites and this shim's
  comments.
- The extension still needs its own release. The shim stops the bleeding; it does
  not deliver the client colours or the diagnostics buffer to users.

## The general rule this establishes

**Independently distributed clients make API removals two-step.** For anything the
extension consumes, ship the tolerant client first, wait for adoption, then remove
the server field. "The branch merges as a unit" is only an argument about the
repository — it says nothing about what is running on a user's machine.

Concretely, before removing any field from `/api/v1/*`, check it against the
published extension's source, not the repository's working tree.
