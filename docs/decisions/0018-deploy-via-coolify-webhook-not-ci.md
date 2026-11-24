# 0018 — Deploy via the Coolify webhook, not a CI job

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** Michal Lénert
- **Related:** AIAGE-78, `docs/gotchas.md` (2026-10-21, 2026-11-24)

## Context

`.github/workflows/ci.yml` had a `deploy` job that called the Coolify API after green tests on `main`. The Coolify panel sits behind Cloudflare Access, which answers the API call with a 302 to its login page, so the job failed on every push since 2026-07-28. Production was deployed anyway, by Coolify's own git webhook on push, which meant `main` was permanently red and failures went unnoticed.

## Decision

Remove the CI deploy job. Coolify's git webhook is the only deploy path; CI only lints, typechecks, tests and builds.

## Alternatives considered

### Alternative A — Cloudflare Access service token

Add `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` (the workflow already supported them). Viable and it would gate deploys on green tests, but needs a token created and maintained in Cloudflare Zero Trust; the owner chose not to.

### Alternative B — Access bypass for `/api/v1/deploy`

Leaves the deploy endpoint protected only by the Coolify token. Same gating benefit, wider exposure of the panel API.

## Consequences

### Positive

- CI on `main` can be green again and a red run means a real failure.
- One deploy path instead of two racing ones.

### Negative

- Deploys are not gated: a push with failing tests still reaches production. Check the Actions run after each push.

### Neutral

- The `COOLIFY_API_TOKEN` secret and `COOLIFY_URL`/`COOLIFY_APP_UUID` variables are unused and can be deleted.

## Follow-ups

- [ ] Delete the unused repo secret and variables (owner).
