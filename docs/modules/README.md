# Modules

This folder is a planned extension point. **It is empty today.**

## When to use it

The flat `docs/{architecture,reference,operations,...}/` layout works well for projects up to roughly **50 docs files and 30 source folders**. When the project grows past that, split per-module:

```
docs/modules/<module-name>/
├── architecture/
├── reference/
├── operations/
└── decisions/
```

Each module mirrors the root `docs/` structure for content scoped to that module. The root `docs/` then describes only cross-module concerns (the system shape, shared invariants, top-level ADRs).

## Why we don't use it now

`time-tracking` is a monorepo with three small apps and three small packages. The flat structure is sufficient and adding a module split now would be premature complexity.

## How to introduce a module split later

1. Identify the seam (likely the boundary between `apps/web` + services and `apps/extension`, or a specific business module).
2. Create `docs/modules/<name>/` and move that module's architecture + reference docs into it.
3. Leave cross-cutting concerns (constitution, top-level ADRs, deployment, business context) in the root `docs/`.
4. Write the first ADR explaining the split.
