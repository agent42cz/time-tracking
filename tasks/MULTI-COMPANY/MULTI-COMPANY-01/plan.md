# Plan

1. Reproduce missing extension switching, MCP scope limitations and company creation/navigation behavior with failing tests.
2. Make company creation atomic and audited; refresh layout and validate web switching.
3. Persist extension selection, reset drafts, refresh permissions/catalog/timers, retain offline company identity.
4. Add explicit opt-in scope to the existing token; use company IDs per MCP call, with membership and scope checks.
5. Test a real browser workflow with a second company, real MCP transport, Postgres integration, and extension browser tests. Run typecheck, lint, build and story traceability.
