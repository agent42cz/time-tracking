# 0001 — Pin pnpm to a specific version

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** Claude Code (autonomous v1 build)
- **Related:** BUILD-PROMPT §4 (now in [`../constitution.md`](../constitution.md))

## Context

The PRD and the original BUILD-PROMPT did not pin a pnpm version. Without a pin, CI and local environments can drift across pnpm releases — workspace resolution and lockfile semantics change between minor versions.

## Decision

Pin `packageManager` to `pnpm@11.0.4` in the root `package.json`. This was the local version at the time of the bootstrap.

## Alternatives considered

### Alternative A — Leave unpinned, document a minimum version

Rejected. Lockfile reproducibility across contributors and CI matters more than convenience. Pinning matches the discipline already applied to Node (`engines: ">=20.11.0"`).

### Alternative B — Use Corepack with a `.nvmrc`-style spec

Rejected for v1 to avoid an extra ceremony layer. Corepack is reasonable; reconsider if there's friction with the pin.

## Consequences

### Positive

- Identical pnpm behavior in dev and CI.
- Lockfile changes can be reasoned about against a single pnpm version.

### Negative

- Bumping pnpm requires a coordinated change to `package.json`.

### Neutral

- CI installs pnpm via `npm i -g pnpm@<version>` from `packageManager` — no extra workflow changes needed.
