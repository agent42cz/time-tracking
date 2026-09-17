# 0017 — Multiple companies in one extension session and MCP connection

- **Status:** Accepted; supersedes the single-company-only token policy of ADR-0008
- **Date:** 2026-09-17
- **Deciders:** Maintainer request, implementation by Codex
- **Related:** US-6, US-7, US-55, US-61; MULTI-COMPANY-01

## Context

A user needs to add a personal company to an existing account, switch the extension between memberships, and use the existing MCP connection for both. The popup always displayed the first membership and forgot explicit company selection on reload. MCP reads used the token company, but entry mutations only checked user membership, allowing a single-company token to modify the same user's entries in another company.

## Decision

The extension keeps its own active company in local storage, identified by API origin and user. Its compact header selector changes the complete company view, clears drafts, and preserves running timers and company-specific offline mutations. Failed switches keep the previous view. Web selection remains a separate cookie; create/switch actions revalidate the authenticated layout.

Keep existing token scope unchanged by default. Add `ApiToken.allCompanies`, default false, and an owner-controlled setting that can update an existing token without changing its secret. Enabling it authorizes the user's current and future memberships. The UI explicitly explains this. MCP exposes `list_companies` and optional `companyId` per tool call. List/start calls default to the original token company; entry mutations infer company from their ID and also validate any explicit company. Every operation checks both token scope and current membership. The original company remains the credential's default and lifecycle anchor.

Never maintain a server-side global "active company" for MCP: parallel conversations must not redirect each other's writes. Never silently fall back to another company when an API request explicitly names an inaccessible company. Validate client/project tenant relationships in the service layer, even when the user belongs to both companies.

## Alternatives considered

### One token and connector per company

Preserves isolation but contradicts the requested single-connection workflow and multiplies configuration.

### Automatically broaden every existing token

Would silently expand existing credentials. An explicit owner setting preserves existing integrations' intended scope.

### Shared mutable company selection across web, extension and MCP

Concurrent tabs and conversations could unexpectedly change another operation's target. Explicit request scope is deterministic.

## Consequences

- One existing MCP connection can work across the user's companies after its owner enables the setting.
- Existing integrations retain their original company and defaults.
- The additive database migration must precede application deployment; no production migration is performed by this task.
- Revoking membership removes access immediately on the next request. Removing membership in the original token company invalidates authentication, as before; deleting that company cascades its tokens, as before.
- Single-company credentials cannot access a second company even if their owner belongs to both.
- Extension offline overlap prompts retain their company; replay is shared across view changes to avoid duplicate sends.
