# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a token-authenticated remote MCP endpoint at `POST /api/mcp` so any user can drive their own time entries from Claude Code / Cursor / etc.

**Architecture:** Single Next.js route handler in `apps/web` reusing the existing `lib/services/*` layer so audit rows and WS broadcasts come for free. Personal API tokens (argon2id-hashed) scoped to one `(user, company)` pair authenticate every request. Stateless streamable-HTTP transport from `@modelcontextprotocol/sdk`.

**Tech Stack:** Next.js 15 App Router, `@modelcontextprotocol/sdk` (new), Prisma 6, `argon2`, `ioredis` (existing), Zod, Vitest + testcontainers, Playwright.

**Source spec:** [`docs/superpowers/specs/2026-05-15-mcp-server-design.md`](../specs/2026-05-15-mcp-server-design.md). Read it first.

---

## Pre-flight: deviations from the spec found during planning

These three things came up while mapping the plan to existing code. None changes the architecture.

1. **`billable` dropped from `update_entry`.** `TimeEntry` has no `billable` column. The spec listed it; this plan does not. If the column ever appears, add it back.
2. **Two tiny read helpers added in `services/time-entries.ts`.** `listMyWeek` is date-bounded and doesn't fit "running" or "recent". Adding `listRunningEntries(db, userId, companyId)` (returns rows where `endedAt IS NULL`) and `listRecentEntries(db, userId, companyId, limit)` (orderBy `startedAt desc`). Both are reads and write no audit.
3. **`listProjects` added in `services/catalog.ts`.** `listClients` and `listTags` exist; `listProjects` does not. The MCP `list_catalog` tool needs all three.

The trace cap also moves from `TOTAL_US = 54` (current) to `63` in `scripts/test-trace.ts`.

---

## File map

### New files

| Path                                                                               | Purpose                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/services/api-tokens.ts`                                          | `issueToken`, `verifyToken`, `revokeToken`, `listTokens`, `touchLastUsed`. Wraps argon2 and the `ApiToken` table.   |
| `apps/web/src/lib/actions/api-tokens.ts`                                           | `'use server'` actions used by the settings page (`issueTokenAction`, `revokeTokenAction`).                         |
| `apps/web/src/server/mcp/authenticate.ts`                                          | Bearer parsing, prefix lookup, hash verify, membership check, rate-limit. Returns `McpAuthContext` or a `Response`. |
| `apps/web/src/server/mcp/rate-limit.ts`                                            | Per-token Redis-backed rate limit; mirrors `lib/api/rate-limit-ip.ts`.                                              |
| `apps/web/src/server/mcp/errors.ts`                                                | Domain → MCP error mapping (`not_found` / `invalid_args` / `conflict` / `internal`).                                |
| `apps/web/src/server/mcp/router.ts`                                                | `buildMcpServer(auth)` — constructs `McpServer`, registers all tools.                                               |
| `apps/web/src/server/mcp/tools/list-running-entries.ts`                            | Tool definition + Zod schema + handler.                                                                             |
| `apps/web/src/server/mcp/tools/list-recent-entries.ts`                             | Same.                                                                                                               |
| `apps/web/src/server/mcp/tools/start-timer.ts`                                     | Same.                                                                                                               |
| `apps/web/src/server/mcp/tools/stop-timer.ts`                                      | Same.                                                                                                               |
| `apps/web/src/server/mcp/tools/update-entry.ts`                                    | Same.                                                                                                               |
| `apps/web/src/server/mcp/tools/list-catalog.ts`                                    | Same.                                                                                                               |
| `apps/web/src/server/mcp/tools/index.ts`                                           | Re-exports + `registerAllTools(server, auth)`.                                                                      |
| `apps/web/src/server/mcp/DESCRIPTION.md`                                           | Folder description per CLAUDE.md rule.                                                                              |
| `apps/web/src/app/api/mcp/route.ts`                                                | `POST` handler; `GET → 405`.                                                                                        |
| `apps/web/src/app/(authenticated)/settings/api-tokens/page.tsx`                    | List view.                                                                                                          |
| `apps/web/src/app/(authenticated)/settings/api-tokens/CreateTokenDialog.tsx`       | Create flow incl. plaintext-once display.                                                                           |
| `apps/web/src/app/(authenticated)/settings/api-tokens/RevokeTokenButton.tsx`       | Revoke confirm dialog.                                                                                              |
| `apps/web/tests/services/api-tokens.test.ts`                                       | Service unit tests.                                                                                                 |
| `apps/web/tests/server/mcp/authenticate.test.ts`                                   | Auth/rate-limit.                                                                                                    |
| `apps/web/tests/server/mcp/tools/list-running-entries.test.ts`                     | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/tools/list-recent-entries.test.ts`                      | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/tools/start-timer.test.ts`                              | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/tools/stop-timer.test.ts`                               | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/tools/update-entry.test.ts`                             | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/tools/list-catalog.test.ts`                             | Tool test.                                                                                                          |
| `apps/web/tests/server/mcp/cross-company.test.ts`                                  | Cross-company `not_found` per ID-taking tool.                                                                       |
| `apps/web/tests/_helpers/mcp.ts`                                                   | In-process `Client` against a fake `Request → POST /api/mcp`.                                                       |
| `apps/web/tests/e2e/mcp-skill-flow.spec.ts`                                        | Playwright: settings UI issues token, real MCP `Client` round-trips.                                                |
| `docs/operations/mcp-server.md`                                                    | Ops/usage doc (English).                                                                                            |
| `docs/decisions/0008-mcp-server.md`                                                | ADR for the stack additions.                                                                                        |
| `packages/db/prisma/migrations/<ts>_add_api_tokens_and_audit_source/migration.sql` | Generated.                                                                                                          |

### Modified files

| Path                                                 | Change                                                                                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                   | Add `ApiToken` model; add `AuditSource` enum + `source` column to `AuditLog`.                                                                                     |
| `apps/web/src/lib/services/audit.ts`                 | `AuditWriteInput` gets optional `source?: AuditSource`; defaults `'web'`.                                                                                         |
| `apps/web/src/lib/services/time-entries.ts`          | `startTimer` / `stopTimer` / `updateEntry` accept optional `source?: AuditSource` and forward; add new read helpers `listRunningEntries` and `listRecentEntries`. |
| `apps/web/src/lib/services/catalog.ts`               | Add `listProjects(db, userId, companyId, opts)`.                                                                                                                  |
| `apps/web/src/app/(authenticated)/settings/page.tsx` | Link to `/settings/api-tokens`.                                                                                                                                   |
| `apps/web/messages/cs.json`                          | New `settings.apiTokens.*` namespace.                                                                                                                             |
| `apps/web/tests/services/audit.test.ts`              | Extend the static check to forbid `auditLog.update/delete` in the new `server/mcp/` tree too.                                                                     |
| `apps/web/tests/services/time-entries.test.ts`       | One small test that `source: 'mcp'` flows through.                                                                                                                |
| `docs/reference/features.md`                         | Append US-55..63; bump header range.                                                                                                                              |
| `docs/reference/acceptance.md`                       | Append US-55..63 acceptance rows.                                                                                                                                 |
| `docs/reference/env-vars.md`                         | No new vars; add a note that MCP reuses `REDIS_URL`.                                                                                                              |
| `scripts/test-trace.ts`                              | `TOTAL_US = 63`.                                                                                                                                                  |
| `apps/web/package.json`                              | `+@modelcontextprotocol/sdk`.                                                                                                                                     |

---

## Phase 0 — Branch, deps, and verify the baseline is green

### Task 0.1: Create a feature branch and verify baseline tests pass

**Files:** —

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/mcp-server
```

- [ ] **Step 2: Verify the baseline is green before adding anything**

Run: `pnpm install && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. If anything is already red on `main`, stop and fix that first.

- [ ] **Step 3: Verify trace passes**

Run: `pnpm test:trace`
Expected: `100% (54/54)` (matches current `TOTAL_US = 54` in `scripts/test-trace.ts`).

### Task 0.2: Add the MCP SDK dependency

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Install**

```bash
pnpm --filter @tt/web add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Verify the version landed**

Run: `pnpm --filter @tt/web list @modelcontextprotocol/sdk`
Expected: shows the installed version (≥ 1.0.0).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add @modelcontextprotocol/sdk for MCP server"
```

---

## Phase 1 — Schema migration

### Task 1.1: Add `AuditSource` enum and `AuditLog.source` column

**Files:**

- Modify: `packages/db/prisma/schema.prisma`

- [ ] **Step 1: Edit the schema**

Add the enum near other enums and the column to `AuditLog`:

```prisma
enum AuditSource {
  web
  extension
  mcp

  @@map("audit_source")
}

model AuditLog {
  id          String      @id @default(cuid())
  companyId   String      @map("company_id")
  actorUserId String?     @map("actor_user_id")
  action      AuditAction
  entityType  String      @map("entity_type")
  entityId    String      @map("entity_id")
  before      Json?
  after       Json?
  source      AuditSource @default(web)
  createdAt   DateTime    @default(now()) @map("created_at")

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  actor   User?   @relation("AuditActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([entityType, entityId])
  @@index([actorUserId])
  @@map("audit_logs")
}
```

- [ ] **Step 2: Add the `ApiToken` model**

```prisma
model ApiToken {
  id         String    @id @default(cuid())
  userId     String    @map("user_id")
  companyId  String    @map("company_id")
  name       String
  tokenHash  String    @unique @map("token_hash")
  prefix     String    @map("prefix")
  lastUsedAt DateTime? @map("last_used_at")
  revokedAt  DateTime? @map("revoked_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([userId, companyId])
  @@index([prefix])
  @@map("api_tokens")
}
```

Add reverse relations on `User` and `Company`:

```prisma
model User {
  // … existing fields …
  apiTokens ApiToken[]
}

model Company {
  // … existing fields …
  apiTokens ApiToken[]
}
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm db:up                                    # start local Postgres on :5433
pnpm --filter @tt/db exec prisma migrate dev --name add_api_tokens_and_audit_source
```

Expected: a new file under `packages/db/prisma/migrations/<ts>_add_api_tokens_and_audit_source/migration.sql`. Open it and sanity-check: it should `CREATE TYPE audit_source`, `ALTER TABLE audit_logs ADD COLUMN source … DEFAULT 'web'`, `CREATE TABLE api_tokens …`, and create the two indexes.

- [ ] **Step 4: Regenerate the Prisma client**

```bash
pnpm prisma:generate
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — existing services keep working because `AuditWriteInput.source` is not added yet (default applies at DB level).

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat(db): add ApiToken model and AuditLog.source"
```

---

## Phase 2 — Thread `source` through audit and key services

### Task 2.1: Make `AuditWriteInput` accept `source` and default it

**Files:**

- Modify: `apps/web/src/lib/services/audit.ts`

- [ ] **Step 1: Write a failing test first**

Append to `apps/web/tests/services/audit.test.ts`:

```ts
import type { AuditSource } from '@prisma/client';
import { writeAudit } from '../../src/lib/services/audit.js';

it('writeAudit defaults source to web and stores the override', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'src');
    const e = await startTimer(tx, w.user, { companyId: w.company });
    if (!e.ok) throw new Error('setup');

    // Default branch
    await writeAudit(tx, {
      companyId: w.company,
      actorUserId: w.user,
      action: 'update',
      entityType: 'TimeEntry',
      entityId: e.value.id,
    });
    // Explicit mcp branch
    await writeAudit(tx, {
      companyId: w.company,
      actorUserId: w.user,
      action: 'update',
      entityType: 'TimeEntry',
      entityId: e.value.id,
      source: 'mcp' satisfies AuditSource,
    });

    const rows = await tx.auditLog.findMany({
      where: { entityType: 'TimeEntry', entityId: e.value.id, action: 'update' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.source)).toEqual(['web', 'mcp']);
  });
});
```

- [ ] **Step 2: Run it; expect a compile / runtime error**

Run: `pnpm --filter @tt/web vitest run tests/services/audit.test.ts -t 'defaults source'`
Expected: FAIL — `source` is not a valid `AuditWriteInput` field.

- [ ] **Step 3: Implement**

Replace `AuditWriteInput` and `writeAudit` in `apps/web/src/lib/services/audit.ts`:

```ts
import type { AuditAction, AuditSource, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export interface AuditWriteInput {
  companyId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: JsonValue;
  after?: JsonValue;
  source?: AuditSource;
}

export async function writeAudit(db: Db, input: AuditWriteInput): Promise<void> {
  await db.auditLog.create({
    data: {
      companyId: input.companyId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? null) as Prisma.InputJsonValue,
      after: (input.after ?? null) as Prisma.InputJsonValue,
      source: input.source ?? 'web',
    },
  });
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @tt/web vitest run tests/services/audit.test.ts -t 'defaults source'`
Expected: PASS.

- [ ] **Step 5: Run the whole audit suite to confirm nothing regressed**

Run: `pnpm --filter @tt/web vitest run tests/services/audit.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/audit.ts apps/web/tests/services/audit.test.ts
git commit -m "feat(audit): thread optional source through writeAudit"
```

### Task 2.2: Thread `source` through `time-entries.ts` mutation services

**Files:**

- Modify: `apps/web/src/lib/services/time-entries.ts`
- Modify: `apps/web/tests/services/time-entries.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/services/time-entries.test.ts`:

```ts
it('US-59: startTimer/updateEntry/stopTimer forward source to audit', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'src');
    const s = await startTimer(
      tx,
      w.user,
      { companyId: w.company, description: 'mcp start' },
      undefined, // now
      { source: 'mcp' },
    );
    if (!s.ok) throw new Error('startTimer');
    await updateEntry(tx, w.user, s.value.id, { description: 'mcp edit' }, undefined, {
      source: 'mcp',
    });
    await stopTimer(tx, w.user, s.value.id, undefined, { source: 'mcp' });

    const rows = await tx.auditLog.findMany({
      where: { entityId: s.value.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true, source: true },
    });
    expect(rows).toEqual([
      { action: 'create', source: 'mcp' },
      { action: 'update', source: 'mcp' },
      { action: 'update', source: 'mcp' },
    ]);
  });
});
```

- [ ] **Step 2: Run it; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/services/time-entries.test.ts -t 'US-59: startTimer/updateEntry/stopTimer forward source'`
Expected: FAIL — signature mismatch.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/services/time-entries.ts`, add `AuditOpts` near the top:

```ts
import type { AuditSource } from '@prisma/client';

export interface AuditOpts {
  source?: AuditSource;
}
```

Change the three mutation signatures and threading. Diff sketch:

```ts
export async function startTimer(
  db: Db,
  actorUserId: string,
  input: StartTimerInput,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<{ id: string }>> {
  // … unchanged body …
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'TimeEntry',
    entityId: entry.id,
    after: (await snapshot(db, entry.id)) as never,
    source: audit.source,
  });
  // … unchanged tail …
}

export async function stopTimer(
  db: Db,
  actorUserId: string,
  entryId: string,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<true, 'not_found' | 'not_running' | 'forbidden'>> {
  // … unchanged body …
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'update',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
    source: audit.source,
  });
  // … unchanged tail …
}

export async function updateEntry(
  db: Db,
  actorUserId: string,
  entryId: string,
  patch: UpdateEntryPatch,
  now: Date = new Date(),
  audit: AuditOpts = {},
): Promise<Result<true, 'not_found' | 'invalid_window' | 'future_timestamp'>> {
  // … unchanged body …
  await writeAudit(db, {
    companyId: entry.companyId,
    actorUserId,
    action: 'update',
    entityType: 'TimeEntry',
    entityId: entryId,
    before: before as never,
    after: (await snapshot(db, entryId)) as never,
    source: audit.source,
  });
  // … unchanged tail …
}
```

- [ ] **Step 4: Run the new test**

Run: `pnpm --filter @tt/web vitest run tests/services/time-entries.test.ts -t 'forward source'`
Expected: PASS.

- [ ] **Step 5: Run the full time-entries suite to confirm no regression**

Run: `pnpm --filter @tt/web vitest run tests/services/time-entries.test.ts`
Expected: all PASS — existing callers don't pass `audit`, the default `{}` applies, `source` falls through to `'web'`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/services/time-entries.ts apps/web/tests/services/time-entries.test.ts
git commit -m "feat(time-entries): accept optional audit source on mutations"
```

### Task 2.3: Add `listRunningEntries` and `listRecentEntries` to `time-entries.ts`

**Files:**

- Modify: `apps/web/src/lib/services/time-entries.ts`
- Modify: `apps/web/tests/services/time-entries.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/services/time-entries.test.ts`:

```ts
import { listRecentEntries, listRunningEntries } from '../../src/lib/services/time-entries.js';

it('US-57: listRunningEntries returns only endedAt-null entries for the user', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'lr');
    const a = await startTimer(tx, w.user, { companyId: w.company, description: 'a' });
    const b = await startTimer(tx, w.user, { companyId: w.company, description: 'b' });
    if (!a.ok || !b.ok) throw new Error('setup');
    await stopTimer(tx, w.user, a.value.id);

    const res = await listRunningEntries(tx, w.user, w.company);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((e) => e.id)).toEqual([b.value.id]);
  });
});

it('listRecentEntries returns most-recent first up to limit', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'lre');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await startTimer(tx, w.user, {
        companyId: w.company,
        description: `e${i}`,
      });
      if (!r.ok) throw new Error('setup');
      ids.push(r.value.id);
      await stopTimer(tx, w.user, r.value.id);
    }
    const res = await listRecentEntries(tx, w.user, w.company, 2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // most recent first: ids[2], ids[1]
    expect(res.value.map((e) => e.id)).toEqual([ids[2], ids[1]]);
  });
});

it('listRunningEntries returns not_found for a non-member', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx, 'lrx');
    const res = await listRunningEntries(tx, w.outsider, w.company);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_found');
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/services/time-entries.test.ts -t 'listRunningEntries|listRecentEntries'`
Expected: FAIL — exports don't exist.

- [ ] **Step 3: Implement**

Append to `apps/web/src/lib/services/time-entries.ts`:

```ts
export async function listRunningEntries(
  db: Db,
  actorUserId: string,
  companyId: string,
): Promise<
  Result<
    {
      id: string;
      description: string;
      startedAt: Date;
      clientId: string | null;
      projectId: string | null;
      tagIds: string[];
    }[]
  >
> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const rows = await db.timeEntry.findMany({
    where: { userId: actorUserId, companyId, endedAt: null, deletedAt: null },
    orderBy: { startedAt: 'asc' },
    include: { tags: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      startedAt: r.startedAt,
      clientId: r.clientId,
      projectId: r.projectId,
      tagIds: r.tags.map((t) => t.tagId),
    })),
  };
}

export async function listRecentEntries(
  db: Db,
  actorUserId: string,
  companyId: string,
  limit: number,
): Promise<
  Result<
    {
      id: string;
      description: string;
      startedAt: Date;
      endedAt: Date | null;
      clientId: string | null;
      projectId: string | null;
      tagIds: string[];
    }[]
  >
> {
  const role = await getMembership(db, actorUserId, companyId);
  if (!role) return { ok: false, reason: 'not_found' };
  const capped = Math.max(1, Math.min(50, Math.trunc(limit)));
  const rows = await db.timeEntry.findMany({
    where: { userId: actorUserId, companyId, deletedAt: null },
    orderBy: { startedAt: 'desc' },
    take: capped,
    include: { tags: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id,
      description: r.description,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      clientId: r.clientId,
      projectId: r.projectId,
      tagIds: r.tags.map((t) => t.tagId),
    })),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @tt/web vitest run tests/services/time-entries.test.ts -t 'listRunningEntries|listRecentEntries'`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/time-entries.ts apps/web/tests/services/time-entries.test.ts
git commit -m "feat(time-entries): add listRunningEntries and listRecentEntries"
```

### Task 2.4: Add `listProjects` to `catalog.ts`

**Files:**

- Modify: `apps/web/src/lib/services/catalog.ts`
- Modify: `apps/web/tests/services/catalog.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/services/catalog.test.ts` (mirror the existing `listClients` test style):

```ts
it('listProjects returns projects for company across clients', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx); // existing helper
    const c = await createClient(tx, w.admin, { companyId: w.company, name: 'Acme' });
    if (!c.ok) throw new Error('setup');
    const p1 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'Web' });
    const p2 = await createProject(tx, w.admin, { clientId: c.value.id, name: 'App' });
    if (!p1.ok || !p2.ok) throw new Error('setup');

    const res = await listProjects(tx, w.user, w.company, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((p) => p.name).sort()).toEqual(['App', 'Web']);
  });
});

it('listProjects is not_found for a non-member', async () => {
  await withTx(async (tx) => {
    const w = await bootstrap(tx);
    const res = await listProjects(tx, w.outsider, w.company, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_found');
  });
});
```

(Adjust `bootstrap()` import to match what `catalog.test.ts` already uses.)

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/services/catalog.test.ts -t 'listProjects'`
Expected: FAIL — export missing.

- [ ] **Step 3: Implement**

Append to `apps/web/src/lib/services/catalog.ts`:

```ts
export async function listProjects(
  db: Db,
  actorUserId: string,
  companyId: string,
  opts: { includeArchived?: boolean; clientId?: string } = {},
): Promise<Result<{ id: string; name: string; clientId: string; archived: boolean }[]>> {
  const auth = await requireMember(db, actorUserId, companyId);
  if (!auth.ok) return auth;
  const rows = await db.project.findMany({
    where: {
      client: { companyId },
      ...(opts.includeArchived ? {} : { archived: false }),
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
    },
    orderBy: [{ clientId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return {
    ok: true,
    value: rows.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      archived: p.archived,
    })),
  };
}
```

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @tt/web vitest run tests/services/catalog.test.ts -t 'listProjects'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/catalog.ts apps/web/tests/services/catalog.test.ts
git commit -m "feat(catalog): add listProjects company-wide reader"
```

---

## Phase 3 — `api-tokens` service

### Task 3.1: Issue and verify tokens

**Files:**

- Create: `apps/web/src/lib/services/api-tokens.ts`
- Create: `apps/web/tests/services/api-tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/web/tests/services/api-tokens.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../src/lib/services/companies.js';
import {
  issueToken,
  listTokens,
  revokeToken,
  verifyToken,
} from '../../src/lib/services/api-tokens.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `at-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `AT ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('api tokens', () => {
  it('US-55: issueToken returns plaintext once, stores argon2 hash, and writes one audit row', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '55');
      const before = await tx.auditLog.count();
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'Laptop',
      });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      expect(issued.value.plaintext).toMatch(/^tt_pat_[a-z2-7]{24}$/);
      const row = await tx.apiToken.findUniqueOrThrow({ where: { id: issued.value.id } });
      expect(row.prefix).toBe(issued.value.plaintext.slice(0, 14));
      expect(row.tokenHash).not.toContain(issued.value.plaintext);
      expect(row.revokedAt).toBeNull();
      const after = await tx.auditLog.count();
      expect(after).toBe(before + 1);
    });
  });

  it('verifyToken matches the issued plaintext and rejects mismatch', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'v');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'K',
      });
      if (!issued.ok) throw new Error('setup');

      const ok = await verifyToken(tx, issued.value.plaintext);
      expect(ok.ok).toBe(true);
      if (!ok.ok) return;
      expect(ok.value.userId).toBe(w.userId);
      expect(ok.value.companyId).toBe(w.companyId);

      const bad = await verifyToken(tx, issued.value.plaintext.replace(/.$/, 'a'));
      expect(bad.ok).toBe(false);
    });
  });

  it('US-62: verifyToken rejects a revoked token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'R',
      });
      if (!issued.ok) throw new Error('setup');
      await revokeToken(tx, w.userId, issued.value.id);
      const r = await verifyToken(tx, issued.value.plaintext);
      expect(r.ok).toBe(false);
    });
  });

  it('US-56: listTokens returns the user’s tokens with prefix, no hash', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'l');
      const a = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'A',
      });
      const b = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'B',
      });
      if (!a.ok || !b.ok) throw new Error('setup');
      const list = await listTokens(tx, w.userId);
      expect(list.map((t) => t.name).sort()).toEqual(['A', 'B']);
      expect(Object.keys(list[0])).not.toContain('tokenHash');
    });
  });

  it('US-56: revokeToken is idempotent and writes one audit row', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv2');
      const issued = await issueToken(tx, w.userId, {
        companyId: w.companyId,
        name: 'R',
      });
      if (!issued.ok) throw new Error('setup');
      const before = await tx.auditLog.count();
      const r1 = await revokeToken(tx, w.userId, issued.value.id);
      expect(r1.ok).toBe(true);
      const r2 = await revokeToken(tx, w.userId, issued.value.id);
      expect(r2.ok).toBe(true);
      const after = await tx.auditLog.count();
      // exactly one audit row for the first revoke; second is a no-op
      expect(after).toBe(before + 1);
    });
  });

  it('revokeToken refuses to touch another user’s token', async () => {
    await withTx(async (tx) => {
      const a = await setup(tx, 'oa');
      const b = await setup(tx, 'ob');
      const issued = await issueToken(tx, a.userId, {
        companyId: a.companyId,
        name: 'A',
      });
      if (!issued.ok) throw new Error('setup');
      const r = await revokeToken(tx, b.userId, issued.value.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not_found');
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/services/api-tokens.test.ts`
Expected: FAIL — service file missing.

- [ ] **Step 3: Implement the service**

Create `apps/web/src/lib/services/api-tokens.ts`:

```ts
/**
 * Personal API tokens for the MCP server. Argon2id-hashed at rest;
 * plaintext is returned exactly once at issue time. Tokens are scoped
 * to a (user, company) pair — the MCP request inherits both from the
 * token, never trusts client-supplied identifiers.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { writeAudit } from './audit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export type Result<T, R extends string = 'not_found'> =
  | { ok: true; value: T }
  | { ok: false; reason: R };

const TOKEN_PREFIX = 'tt_pat_';
const SECRET_LEN = 24;
const PREFIX_LEN = TOKEN_PREFIX.length + 7; // "tt_pat_" + first 7 chars

// RFC 4648 base32 alphabet, lowercase, no padding.
const ALPHA = 'abcdefghijklmnopqrstuvwxyz234567';

function randomBase32(n: number): string {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i]! % 32];
  return out;
}

export interface IssueInput {
  companyId: string;
  name: string;
}

export async function issueToken(
  db: Db,
  actorUserId: string,
  input: IssueInput,
): Promise<Result<{ id: string; plaintext: string }>> {
  const m = await db.membership.findUnique({
    where: { userId_companyId: { userId: actorUserId, companyId: input.companyId } },
  });
  if (!m) return { ok: false, reason: 'not_found' };
  const trimmed = input.name.trim();
  if (!trimmed || trimmed.length > 100) return { ok: false, reason: 'not_found' };

  const plaintext = TOKEN_PREFIX + randomBase32(SECRET_LEN);
  const prefix = plaintext.slice(0, PREFIX_LEN);
  const tokenHash = await hashPassword(plaintext);

  const created = await db.apiToken.create({
    data: {
      userId: actorUserId,
      companyId: input.companyId,
      name: trimmed,
      tokenHash,
      prefix,
    },
  });
  await writeAudit(db, {
    companyId: input.companyId,
    actorUserId,
    action: 'create',
    entityType: 'ApiToken',
    entityId: created.id,
    after: { name: trimmed, prefix },
  });
  return { ok: true, value: { id: created.id, plaintext } };
}

export async function verifyToken(
  db: Db,
  presented: string,
): Promise<Result<{ tokenId: string; userId: string; companyId: string }>> {
  if (!presented.startsWith(TOKEN_PREFIX)) return { ok: false, reason: 'not_found' };
  const prefix = presented.slice(0, PREFIX_LEN);
  const candidates = await db.apiToken.findMany({
    where: { prefix, revokedAt: null },
    take: 5, // collisions on the 7-char tail are astronomically unlikely but bounded
  });
  for (const c of candidates) {
    if (await verifyPassword(c.tokenHash, presented)) {
      return {
        ok: true,
        value: { tokenId: c.id, userId: c.userId, companyId: c.companyId },
      };
    }
  }
  return { ok: false, reason: 'not_found' };
}

export async function revokeToken(
  db: Db,
  actorUserId: string,
  tokenId: string,
): Promise<Result<true>> {
  const t = await db.apiToken.findUnique({ where: { id: tokenId } });
  if (!t || t.userId !== actorUserId) return { ok: false, reason: 'not_found' };
  if (t.revokedAt) return { ok: true, value: true }; // idempotent, no second audit row
  await db.apiToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
  await writeAudit(db, {
    companyId: t.companyId,
    actorUserId,
    action: 'update', // there is no 'revoke' action in AuditAction; use update with after.revokedAt
    entityType: 'ApiToken',
    entityId: tokenId,
    after: { revokedAt: new Date().toISOString() },
  });
  return { ok: true, value: true };
}

export async function listTokens(
  db: Db,
  actorUserId: string,
): Promise<
  Array<{
    id: string;
    companyId: string;
    name: string;
    prefix: string;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>
> {
  const rows = await db.apiToken.findMany({
    where: { userId: actorUserId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      companyId: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function touchLastUsed(db: Db, tokenId: string): Promise<void> {
  await db.apiToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } });
}
```

> **Note:** `AuditAction` doesn't currently have a `revoke` value, so revoke is logged as `update` with `after.revokedAt`. Adding a new enum value is a schema change and out of scope here — `update` is fine for v1.

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @tt/web vitest run tests/services/api-tokens.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/api-tokens.ts apps/web/tests/services/api-tokens.test.ts
git commit -m "feat(api-tokens): issue/verify/revoke/list personal MCP tokens"
```

---

## Phase 4 — MCP server module

### Task 4.1: Per-token rate limit (Redis-backed, in-memory fallback)

**Files:**

- Create: `apps/web/src/server/mcp/rate-limit.ts`
- Create: `apps/web/tests/server/mcp/rate-limit.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkMcpRateLimit,
  resetMcpRateLimitForTests,
} from '../../../src/server/mcp/rate-limit.js';

describe('mcp rate limit', () => {
  beforeEach(() => resetMcpRateLimitForTests());

  it('US-63: allows up to 60 calls/min/token, then blocks until the next bucket', async () => {
    const tokenId = 't1';
    for (let i = 0; i < 60; i++) {
      const r = await checkMcpRateLimit(tokenId);
      expect(r.ok).toBe(true);
    }
    const r = await checkMcpRateLimit(tokenId);
    expect(r.ok).toBe(false);
    expect(r.resetIn).toBeGreaterThanOrEqual(1);
    expect(r.resetIn).toBeLessThanOrEqual(60);
  });

  it('isolates buckets per token', async () => {
    for (let i = 0; i < 60; i++) await checkMcpRateLimit('a');
    const a = await checkMcpRateLimit('a');
    const b = await checkMcpRateLimit('b');
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/rate-limit.test.ts`
Expected: FAIL — file missing.

- [ ] **Step 3: Implement (mirror `lib/api/rate-limit-ip.ts`)**

Create `apps/web/src/server/mcp/rate-limit.ts`:

```ts
import 'server-only';
import Redis from 'ioredis';

const WINDOW_SECONDS = 60;
const MAX_PER_MINUTE = 60;

declare global {
  var __ttMcpRateLimitRedis: Redis | undefined;
  var __ttMcpRateLimitMem: Map<string, { count: number; expires: number }> | undefined;
}

function redis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!globalThis.__ttMcpRateLimitRedis) {
    globalThis.__ttMcpRateLimitRedis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return globalThis.__ttMcpRateLimitRedis;
}

function memMap(): Map<string, { count: number; expires: number }> {
  if (!globalThis.__ttMcpRateLimitMem) globalThis.__ttMcpRateLimitMem = new Map();
  return globalThis.__ttMcpRateLimitMem;
}

export interface McpRateLimitResult {
  ok: boolean;
  remaining: number;
  resetIn: number;
}

export async function checkMcpRateLimit(tokenId: string): Promise<McpRateLimitResult> {
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `mcp:rl:${tokenId}:${bucket}`;
  const r = redis();
  if (r) {
    try {
      if (r.status !== 'ready' && r.status !== 'connecting') await r.connect();
      const count = await r.incr(key);
      if (count === 1) await r.expire(key, WINDOW_SECONDS);
      const resetIn = WINDOW_SECONDS - Math.floor((Date.now() % (WINDOW_SECONDS * 1000)) / 1000);
      return {
        ok: count <= MAX_PER_MINUTE,
        remaining: Math.max(0, MAX_PER_MINUTE - count),
        resetIn,
      };
    } catch {
      // fall through
    }
  }
  const map = memMap();
  const now = Date.now();
  const entry = map.get(key);
  const expires = (bucket + 1) * WINDOW_SECONDS * 1000;
  if (entry && entry.expires > now) {
    entry.count += 1;
    return {
      ok: entry.count <= MAX_PER_MINUTE,
      remaining: Math.max(0, MAX_PER_MINUTE - entry.count),
      resetIn: Math.ceil((entry.expires - now) / 1000),
    };
  }
  map.set(key, { count: 1, expires });
  if (map.size > 1024) for (const [k, v] of map) if (v.expires <= now) map.delete(k);
  return {
    ok: true,
    remaining: MAX_PER_MINUTE - 1,
    resetIn: Math.ceil((expires - now) / 1000),
  };
}

/** Test-only — wipes the in-memory bucket map. Never call from product code. */
export function resetMcpRateLimitForTests(): void {
  globalThis.__ttMcpRateLimitMem = new Map();
}
```

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/rate-limit.ts apps/web/tests/server/mcp/rate-limit.test.ts
git commit -m "feat(mcp): per-token rate limit (60 req/min)"
```

### Task 4.2: Error mapping helper

**Files:**

- Create: `apps/web/src/server/mcp/errors.ts`

- [ ] **Step 1: Implement (no separate test — exercised by tool tests)**

```ts
/**
 * Maps internal domain errors to the MCP tool-call error shape. The HTTP
 * transport layer handles 401/429; everything else flows through here.
 *
 * Existence-leak hygiene (constitution §3): "not in your company" and
 * "doesn't exist" both surface as `not_found`. Never report which one.
 */
export type McpErrorCode = 'not_found' | 'invalid_args' | 'conflict' | 'internal';

export interface McpToolError {
  isError: true;
  content: { type: 'text'; text: string }[];
  structuredContent: { code: McpErrorCode; message: string };
}

export function toolError(code: McpErrorCode, message: string): McpToolError {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    structuredContent: { code, message },
  };
}

export function mapServiceReason(reason: string): { code: McpErrorCode; message: string } {
  switch (reason) {
    case 'not_found':
    case 'forbidden': // collapse to not_found per spec
      return { code: 'not_found', message: 'Not found.' };
    case 'not_running':
      return { code: 'conflict', message: 'Timer is not running.' };
    case 'invalid_window':
      return { code: 'invalid_args', message: 'Invalid time window.' };
    case 'future_timestamp':
      return { code: 'invalid_args', message: 'Timestamp is in the future.' };
    default:
      return { code: 'internal', message: 'Internal error.' };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/server/mcp/errors.ts
git commit -m "feat(mcp): error mapping helper"
```

### Task 4.3: Authenticate the request

**Files:**

- Create: `apps/web/src/server/mcp/authenticate.ts`
- Create: `apps/web/tests/server/mcp/authenticate.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../src/lib/services/companies.js';
import { issueToken, revokeToken } from '../../../src/lib/services/api-tokens.js';
import { authenticateRequest } from '../../../src/server/mcp/authenticate.js';
import { resetMcpRateLimitForTests } from '../../../src/server/mcp/rate-limit.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);
beforeEach(() => resetMcpRateLimitForTests());

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `mca-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `MCA ${suffix}`, createdByUserId: u.id });
  const t = await issueToken(tx, u.id, { companyId: c, name: 'K' });
  if (!t.ok) throw new Error('setup');
  return { userId: u.id, companyId: c, plaintext: t.value.plaintext, tokenId: t.value.id };
}

function req(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers.authorization = authHeader;
  return new Request('http://localhost/api/mcp', { method: 'POST', headers });
}

describe('mcp authenticate', () => {
  it('401 on missing header', async () => {
    const r = await authenticateRequest(req(), { db: await getTestPrisma() });
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it('401 on malformed bearer', async () => {
    const r = await authenticateRequest(req('Bearer notatoken'), { db: await getTestPrisma() });
    expect(r).toBeInstanceOf(Response);
    if (r instanceof Response) expect(r.status).toBe(401);
  });

  it('US-55: succeeds with a valid token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'ok');
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).not.toBeInstanceOf(Response);
      if (r instanceof Response) return;
      expect(r.userId).toBe(w.userId);
      expect(r.companyId).toBe(w.companyId);
      expect(r.tokenId).toBe(w.tokenId);
    });
  });

  it('US-62: 401 for a revoked token', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rv');
      await revokeToken(tx, w.userId, w.tokenId);
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).toBeInstanceOf(Response);
      if (r instanceof Response) expect(r.status).toBe(401);
    });
  });

  it('US-63: 429 with Retry-After when over the rate limit', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'rl');
      for (let i = 0; i < 60; i++) {
        const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
        if (r instanceof Response) throw new Error(`unexpected 4xx at i=${i}: ${r.status}`);
      }
      const r = await authenticateRequest(req(`Bearer ${w.plaintext}`), { db: tx });
      expect(r).toBeInstanceOf(Response);
      if (r instanceof Response) {
        expect(r.status).toBe(429);
        expect(r.headers.get('retry-after')).toMatch(/^\d+$/);
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/authenticate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/authenticate.ts`:

```ts
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import { verifyToken, touchLastUsed } from '../../lib/services/api-tokens.js';
import { checkMcpRateLimit } from './rate-limit.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface McpAuthContext {
  userId: string;
  companyId: string;
  tokenId: string;
}

const UNAUTHORIZED = (): Response =>
  new Response(null, {
    status: 401,
    headers: { 'WWW-Authenticate': 'Bearer realm="mcp"' },
  });

export async function authenticateRequest(
  req: Request,
  opts: { db: Db },
): Promise<McpAuthContext | Response> {
  const header = req.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return UNAUTHORIZED();
  const presented = header.slice('bearer '.length).trim();
  if (!presented) return UNAUTHORIZED();

  const verified = await verifyToken(opts.db, presented);
  if (!verified.ok) return UNAUTHORIZED();

  // Membership must still exist.
  const m = await opts.db.membership.findUnique({
    where: {
      userId_companyId: {
        userId: verified.value.userId,
        companyId: verified.value.companyId,
      },
    },
  });
  if (!m) return UNAUTHORIZED();

  const rl = await checkMcpRateLimit(verified.value.tokenId);
  if (!rl.ok) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(rl.resetIn) },
    });
  }

  // Fire-and-forget. If the DB blip is real the request still proceeds.
  void touchLastUsed(opts.db, verified.value.tokenId).catch(() => {});

  return {
    userId: verified.value.userId,
    companyId: verified.value.companyId,
    tokenId: verified.value.tokenId,
  };
}
```

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/authenticate.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/authenticate.ts apps/web/tests/server/mcp/authenticate.test.ts
git commit -m "feat(mcp): authenticate bearer + membership + rate limit"
```

### Task 4.4: In-process MCP test client helper

**Files:**

- Create: `apps/web/tests/_helpers/mcp.ts`

We need a small helper that the per-tool tests can use to talk to a real in-process `McpServer` without going through the Next route. This keeps tool tests fast and deterministic.

- [ ] **Step 1: Implement the helper**

Create `apps/web/tests/_helpers/mcp.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../../src/server/mcp/router.js';
import type { McpAuthContext } from '../../src/server/mcp/authenticate.js';

export interface InProcessMcp {
  client: Client;
  close: () => Promise<void>;
}

/**
 * Build a real McpServer bound to the given `(userId, companyId)` and
 * connect it to an in-process Client via an InMemoryTransport pair.
 * The tool handlers run with `db` (typically a test tx).
 */
export async function buildInProcessMcp(args: {
  db: Prisma.TransactionClient;
  userId: string;
  companyId: string;
}): Promise<InProcessMcp> {
  const auth: McpAuthContext = {
    userId: args.userId,
    companyId: args.companyId,
    tokenId: 'test-token',
  };
  const server = buildMcpServer({ auth, db: args.db });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tt-test', version: '0.0.0' }, { capabilities: {} });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
```

> **Note on `buildMcpServer` signature:** the production route builds with `{ auth }` and reads `db` from the global Prisma client. For tests we want to pass in a `tx` so audit assertions can see writes inside a single rollback. `router.ts` therefore takes `{ auth, db? }` and falls back to the global client when `db` is omitted.

- [ ] **Step 2: No commit yet** — this file imports `router.ts`, which is created in Task 4.5. Move on.

### Task 4.5: Build the `McpServer` (router) and the route handler skeleton

**Files:**

- Create: `apps/web/src/server/mcp/tools/index.ts`
- Create: `apps/web/src/server/mcp/router.ts`
- Create: `apps/web/src/app/api/mcp/route.ts`

(The actual tool handlers come next; this task wires the empty registration loop so the helper compiles.)

- [ ] **Step 1: Tool registry**

Create `apps/web/src/server/mcp/tools/index.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { McpAuthContext } from '../authenticate.js';

export interface ToolContext {
  auth: McpAuthContext;
  db: PrismaClient | Prisma.TransactionClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

// Populated by subsequent tasks.
export const toolRegistrars: ToolRegistrar[] = [];

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  for (const r of toolRegistrars) r(server, ctx);
}
```

- [ ] **Step 2: Router**

Create `apps/web/src/server/mcp/router.ts`:

```ts
import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/db.js'; // existing global client
import type { McpAuthContext } from './authenticate.js';
import { registerAllTools } from './tools/index.js';

export interface BuildMcpInput {
  auth: McpAuthContext;
  db?: PrismaClient | Prisma.TransactionClient;
}

export function buildMcpServer(input: BuildMcpInput): McpServer {
  const server = new McpServer(
    { name: 'time-tracking', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  registerAllTools(server, { auth: input.auth, db: input.db ?? prisma });
  return server;
}
```

> Verify the import path `../../lib/db.js` matches the existing exported Prisma client. If it's `apps/web/src/lib/prisma.ts`, fix the import. Most likely it's at `apps/web/src/lib/db.ts` based on the pattern; grep before writing.

- [ ] **Step 3: Route handler**

Create `apps/web/src/app/api/mcp/route.ts`:

```ts
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateRequest } from '../../../server/mcp/authenticate.js';
import { buildMcpServer } from '../../../server/mcp/router.js';
import { prisma } from '../../../lib/db.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticateRequest(req, { db: prisma });
  if (auth instanceof Response) return auth;

  const server = buildMcpServer({ auth });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
```

> If `transport.handleRequest` does not return a `Response` in the installed SDK version, consult `apps/web/node_modules/@modelcontextprotocol/sdk/dist/server/streamableHttp.d.ts` and adapt — likely you collect via a writable and wrap. Newer SDK versions expose a direct `Response`-shaped helper. Pin the import path in this step.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS (with empty `toolRegistrars`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/router.ts apps/web/src/server/mcp/tools/index.ts apps/web/src/app/api/mcp/route.ts
git commit -m "feat(mcp): McpServer router + POST /api/mcp route handler"
```

---

## Phase 5 — Tools (one task per tool, all TDD against the in-process client)

Each tool task has the same shape: write a failing test that talks to the in-process client, implement the tool, run, commit. Tests assert `auditCount` for mutations and the `not_found` collapsing for cross-company.

### Task 5.1: `list_running_entries`

**Files:**

- Create: `apps/web/src/server/mcp/tools/list-running-entries.ts`
- Create: `apps/web/tests/server/mcp/tools/list-running-entries.test.ts`
- Modify: `apps/web/src/server/mcp/tools/index.ts` (register)

- [ ] **Step 1: Write failing test**

Create `apps/web/tests/server/mcp/tools/list-running-entries.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer, stopTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lr-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LR ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: list_running_entries', () => {
  it('US-57: returns only entries with endedAt null, in startedAt asc order', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '57');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'A' });
      const b = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'B' });
      if (!a.ok || !b.ok) throw new Error('setup');
      await stopTimer(tx, w.userId, a.value.id);

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({ name: 'list_running_entries', arguments: {} });
        expect(out.isError).toBeFalsy();
        // structuredContent is the documented output channel for typed payloads
        expect(out.structuredContent).toMatchObject({
          entries: [{ id: b.value.id, description: 'B' }],
        });
      } finally {
        await m.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL** (tool not registered)

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/tools/list-running-entries.test.ts`
Expected: FAIL — "tool not found" or similar.

- [ ] **Step 3: Implement the tool**

Create `apps/web/src/server/mcp/tools/list-running-entries.ts`:

```ts
import { z } from 'zod';
import { listRunningEntries } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const InputSchema = z.object({}).strict();

const EntrySchema = z.object({
  id: z.string(),
  description: z.string(),
  startedAt: z.string(),
  clientId: z.string().nullable(),
  projectId: z.string().nullable(),
  tagIds: z.array(z.string()),
});

const OutputSchema = z.object({
  entries: z.array(EntrySchema),
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_running_entries',
    {
      title: 'List running time entries',
      description:
        'Lists all currently running time entries (where endedAt is null) for the authenticated user in their token-scoped company. The user may have multiple concurrent timers (US-21). Timestamps are ISO 8601 in UTC; the user’s business day is Europe/Prague.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async () => {
      const res = await listRunningEntries(ctx.db, ctx.auth.userId, ctx.auth.companyId);
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = {
        entries: res.value.map((e) => ({
          id: e.id,
          description: e.description,
          startedAt: e.startedAt.toISOString(),
          clientId: e.clientId,
          projectId: e.projectId,
          tagIds: e.tagIds,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
```

- [ ] **Step 4: Run; expect PASS**

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/tools/list-running-entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/tools/list-running-entries.ts apps/web/tests/server/mcp/tools/list-running-entries.test.ts
git commit -m "feat(mcp): list_running_entries tool"
```

### Task 5.2: `list_recent_entries`

**Files:**

- Create: `apps/web/src/server/mcp/tools/list-recent-entries.ts`
- Create: `apps/web/tests/server/mcp/tools/list-recent-entries.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer, stopTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lre-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LRE ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: list_recent_entries', () => {
  it('returns up to limit, most recent first', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'lre');
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await startTimer(tx, w.userId, {
          companyId: w.companyId,
          description: `e${i}`,
        });
        if (!r.ok) throw new Error('setup');
        ids.push(r.value.id);
        await stopTimer(tx, w.userId, r.value.id);
      }
      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'list_recent_entries',
          arguments: { limit: 2 },
        });
        expect(out.isError).toBeFalsy();
        const entries = (out.structuredContent as { entries: { id: string }[] }).entries;
        expect(entries.map((e) => e.id)).toEqual([ids[2], ids[1]]);
      } finally {
        await m.close();
      }
    });
  });

  it('caps limit at 50 and truncates description to 500 chars', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'cap');
      const long = 'x'.repeat(1000);
      const r = await startTimer(tx, w.userId, { companyId: w.companyId, description: long });
      if (!r.ok) throw new Error('setup');
      await stopTimer(tx, w.userId, r.value.id);

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'list_recent_entries',
          arguments: { limit: 999 },
        });
        expect(out.isError).toBeFalsy();
        const entries = (out.structuredContent as { entries: { description: string }[] }).entries;
        expect(entries[0]!.description.length).toBe(500);
      } finally {
        await m.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/tools/list-recent-entries.ts`:

```ts
import { z } from 'zod';
import { listRecentEntries } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const InputSchema = z.object({ limit: z.number().int().min(1).max(50).optional() }).strict();
const OutputSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      clientId: z.string().nullable(),
      projectId: z.string().nullable(),
      tagIds: z.array(z.string()),
    }),
  ),
});

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_recent_entries',
    {
      title: 'List recent time entries',
      description:
        'Lists the most-recent time entries (running or stopped) for the authenticated user in their token-scoped company, newest first. `limit` defaults to 10, max 50. `description` is truncated to 500 chars per row.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const limit = args.limit ?? 10;
      const res = await listRecentEntries(ctx.db, ctx.auth.userId, ctx.auth.companyId, limit);
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = {
        entries: res.value.map((e) => ({
          id: e.id,
          description: e.description.length > 500 ? e.description.slice(0, 500) : e.description,
          startedAt: e.startedAt.toISOString(),
          endedAt: e.endedAt?.toISOString() ?? null,
          clientId: e.clientId,
          projectId: e.projectId,
          tagIds: e.tagIds,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
```

- [ ] **Step 4: Run; PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/tools/list-recent-entries.ts apps/web/tests/server/mcp/tools/list-recent-entries.test.ts
git commit -m "feat(mcp): list_recent_entries tool"
```

### Task 5.3: `start_timer`

**Files:**

- Create: `apps/web/src/server/mcp/tools/start-timer.ts`
- Create: `apps/web/tests/server/mcp/tools/start-timer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `st-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `ST ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: start_timer', () => {
  it('US-58: starts a timer, audits with source=mcp, returns entry id', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '58');
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'start_timer',
          arguments: { description: 'driving from MCP' },
        });
        expect(out.isError).toBeFalsy();
        const { id } = out.structuredContent as { id: string };

        const entry = await tx.timeEntry.findUniqueOrThrow({ where: { id } });
        expect(entry.endedAt).toBeNull();
        expect(entry.description).toBe('driving from MCP');

        const after = await tx.auditLog.count();
        expect(after).toBe(before + 1);
        const audit = await tx.auditLog.findFirstOrThrow({
          where: { entityType: 'TimeEntry', entityId: id },
        });
        expect(audit.source).toBe('mcp');
        expect(audit.actorUserId).toBe(w.userId);
      } finally {
        await m.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/tools/start-timer.ts`:

```ts
import { z } from 'zod';
import { startTimer } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const InputSchema = z
  .object({
    description: z.string().max(2000).optional(),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    tagIds: z.array(z.string()).max(20).optional(),
  })
  .strict();

const OutputSchema = z.object({ id: z.string() });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'start_timer',
    {
      title: 'Start a timer',
      description:
        'Starts a new running time entry. Other already-running timers (US-21) are left alone. Optional `description`, `clientId`, `projectId`, `tagIds`.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await startTimer(
        ctx.db,
        ctx.auth.userId,
        {
          companyId: ctx.auth.companyId,
          description: args.description,
          clientId: args.clientId,
          projectId: args.projectId,
          tagIds: args.tagIds,
        },
        undefined,
        { source: 'mcp' },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = { id: res.value.id };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
```

- [ ] **Step 4: Run; PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/tools/start-timer.ts apps/web/tests/server/mcp/tools/start-timer.test.ts
git commit -m "feat(mcp): start_timer tool"
```

### Task 5.4: `stop_timer`

**Files:**

- Create: `apps/web/src/server/mcp/tools/stop-timer.ts`
- Create: `apps/web/tests/server/mcp/tools/stop-timer.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `sp-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `SP ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: stop_timer', () => {
  it('US-60: stops the targeted entry; leaves another running one alone', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '60');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'a' });
      const b = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'b' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const before = await tx.auditLog.count();

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const ea = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      const eb = await tx.timeEntry.findUniqueOrThrow({ where: { id: b.value.id } });
      expect(ea.endedAt).not.toBeNull();
      expect(eb.endedAt).toBeNull();

      const after = await tx.auditLog.count();
      expect(after).toBe(before + 1);
    });
  });

  it('returns conflict if the entry is already stopped', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'ns');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId });
      if (!a.ok) throw new Error('setup');
      const m1 = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        await m1.client.callTool({ name: 'stop_timer', arguments: { entryId: a.value.id } });
        const out = await m1.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('conflict');
      } finally {
        await m1.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/tools/stop-timer.ts`:

```ts
import { z } from 'zod';
import { stopTimer } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const InputSchema = z.object({ entryId: z.string().min(1) }).strict();
const OutputSchema = z.object({ ok: z.literal(true) });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'stop_timer',
    {
      title: 'Stop a timer',
      description:
        'Ends the running time entry identified by `entryId`. Other running entries are left alone (US-21). Returns `conflict` if the entry is already stopped.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await stopTimer(ctx.db, ctx.auth.userId, args.entryId, undefined, {
        source: 'mcp',
      });
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = { ok: true as const };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
```

- [ ] **Step 4: Run; PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/tools/stop-timer.ts apps/web/tests/server/mcp/tools/stop-timer.test.ts
git commit -m "feat(mcp): stop_timer tool"
```

### Task 5.5: `update_entry`

**Files:**

- Create: `apps/web/src/server/mcp/tools/update-entry.ts`
- Create: `apps/web/tests/server/mcp/tools/update-entry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { startTimer } from '../../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `ue-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `UE ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: update_entry', () => {
  it('US-59: updates description and writes one audit row with source=mcp', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, '59');
      const a = await startTimer(tx, w.userId, { companyId: w.companyId, description: 'old' });
      if (!a.ok) throw new Error('setup');
      const before = await tx.auditLog.count({
        where: { entityType: 'TimeEntry', entityId: a.value.id },
      });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: { entryId: a.value.id, description: 'new' },
        });
        expect(out.isError).toBeFalsy();
      } finally {
        await m.close();
      }

      const updated = await tx.timeEntry.findUniqueOrThrow({ where: { id: a.value.id } });
      expect(updated.description).toBe('new');

      const audits = await tx.auditLog.findMany({
        where: { entityType: 'TimeEntry', entityId: a.value.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(audits.length).toBe(before + 1);
      const last = audits[audits.length - 1]!;
      expect(last.source).toBe('mcp');
      expect(last.action).toBe('update');
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/tools/update-entry.ts`:

```ts
import { z } from 'zod';
import { updateEntry } from '../../../lib/services/time-entries.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const InputSchema = z
  .object({
    entryId: z.string().min(1),
    description: z.string().max(5000).optional(),
    clientId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    tagIds: z.array(z.string()).max(20).optional(),
  })
  .strict();

const OutputSchema = z.object({ ok: z.literal(true) });

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'update_entry',
    {
      title: 'Update a time entry',
      description:
        'Updates fields on a specific time entry identified by `entryId`. Pass `null` for `clientId`/`projectId` to clear the link. `tagIds` replaces the full tag set.',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      const res = await updateEntry(
        ctx.db,
        ctx.auth.userId,
        args.entryId,
        {
          description: args.description,
          clientId: args.clientId,
          projectId: args.projectId,
          tagIds: args.tagIds,
        },
        undefined,
        { source: 'mcp' },
      );
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const payload = { ok: true as const };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
});
```

- [ ] **Step 4: Run; PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/mcp/tools/update-entry.ts apps/web/tests/server/mcp/tools/update-entry.test.ts
git commit -m "feat(mcp): update_entry tool"
```

### Task 5.6: `list_catalog`

**Files:**

- Create: `apps/web/src/server/mcp/tools/list-catalog.ts`
- Create: `apps/web/tests/server/mcp/tools/list-catalog.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../../src/lib/services/companies.js';
import { createClient, createProject, createTag } from '../../../../src/lib/services/catalog.js';
import { buildInProcessMcp } from '../../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function setup(tx: Prisma.TransactionClient, suffix: string) {
  const u = await tx.user.create({ data: { email: `lc-${suffix}@x.test`, fullName: 'U' } });
  const c = await createCompany(tx, { name: `LC ${suffix}`, createdByUserId: u.id });
  return { userId: u.id, companyId: c };
}

describe('mcp tool: list_catalog', () => {
  it('returns clients/projects/tags filtered by query', async () => {
    await withTx(async (tx) => {
      const w = await setup(tx, 'lc');
      const c = await createClient(tx, w.userId, { companyId: w.companyId, name: 'Acme' });
      if (!c.ok) throw new Error('setup');
      await createProject(tx, w.userId, { clientId: c.value.id, name: 'Web' });
      await createTag(tx, w.userId, { companyId: w.companyId, name: 'work' });

      const m = await buildInProcessMcp({ db: tx, userId: w.userId, companyId: w.companyId });
      try {
        const c1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'clients' },
        });
        expect(
          (c1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('Acme');

        const p1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'projects' },
        });
        expect(
          (p1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('Web');

        const t1 = await m.client.callTool({
          name: 'list_catalog',
          arguments: { kind: 'tags', query: 'wo' },
        });
        expect(
          (t1.structuredContent as { items: { name: string }[] }).items.map((i) => i.name),
        ).toContain('work');
      } finally {
        await m.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect FAIL**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/mcp/tools/list-catalog.ts`:

```ts
import { z } from 'zod';
import { listClients, listProjects, listTags } from '../../../lib/services/catalog.js';
import { mapServiceReason, toolError } from '../errors.js';
import { toolRegistrars, type ToolContext } from './index.js';

const KindSchema = z.enum(['clients', 'projects', 'tags']);
const InputSchema = z
  .object({
    kind: KindSchema,
    query: z.string().max(200).optional(),
  })
  .strict();

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Optional extras depending on kind
  archived: z.boolean().optional(),
  clientId: z.string().optional(),
  color: z.string().optional(),
});

const OutputSchema = z.object({ items: z.array(ItemSchema) });

function matchesQuery(name: string, q: string | undefined): boolean {
  if (!q) return true;
  const lower = name.toLocaleLowerCase('cs-CZ');
  return lower.includes(q.toLocaleLowerCase('cs-CZ'));
}

toolRegistrars.push((server, ctx: ToolContext) => {
  server.registerTool(
    'list_catalog',
    {
      title: 'List catalog (clients / projects / tags)',
      description:
        'Lists company-level catalog entities the user can pick from. `kind` is one of `clients`, `projects`, `tags`. Optional `query` filters by substring (Czech locale, case- and diacritic-insensitive at the DB level).',
      inputSchema: InputSchema.shape,
      outputSchema: OutputSchema.shape,
    },
    async (args) => {
      if (args.kind === 'clients') {
        const res = await listClients(ctx.db, ctx.auth.userId, ctx.auth.companyId);
        if (!res.ok) {
          const { code, message } = mapServiceReason(res.reason);
          return toolError(code, message);
        }
        const items = res.value
          .filter((c) => matchesQuery(c.name, args.query))
          .map((c) => ({ id: c.id, name: c.name, archived: c.archived }));
        return {
          content: [{ type: 'text', text: JSON.stringify({ items }) }],
          structuredContent: { items },
        };
      }
      if (args.kind === 'projects') {
        const res = await listProjects(ctx.db, ctx.auth.userId, ctx.auth.companyId, {});
        if (!res.ok) {
          const { code, message } = mapServiceReason(res.reason);
          return toolError(code, message);
        }
        const items = res.value
          .filter((p) => matchesQuery(p.name, args.query))
          .map((p) => ({ id: p.id, name: p.name, clientId: p.clientId, archived: p.archived }));
        return {
          content: [{ type: 'text', text: JSON.stringify({ items }) }],
          structuredContent: { items },
        };
      }
      const res = await listTags(ctx.db, ctx.auth.userId, ctx.auth.companyId);
      if (!res.ok) {
        const { code, message } = mapServiceReason(res.reason);
        return toolError(code, message);
      }
      const items = res.value
        .filter((t) => matchesQuery(t.name, args.query))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ items }) }],
        structuredContent: { items },
      };
    },
  );
});
```

- [ ] **Step 4: Run; PASS**

- [ ] **Step 5: Wire all tool files into router**

Edit `apps/web/src/server/mcp/tools/index.ts` to import each tool file for its side-effect registration:

```ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { McpAuthContext } from '../authenticate.js';

export interface ToolContext {
  auth: McpAuthContext;
  db: PrismaClient | Prisma.TransactionClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

export const toolRegistrars: ToolRegistrar[] = [];

// Side-effect imports — each tool file pushes its registrar onto `toolRegistrars`.
import './list-running-entries.js';
import './list-recent-entries.js';
import './start-timer.js';
import './stop-timer.js';
import './update-entry.js';
import './list-catalog.js';

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  for (const r of toolRegistrars) r(server, ctx);
}
```

- [ ] **Step 6: Typecheck + run all tool tests**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web vitest run tests/server/mcp`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/mcp/tools apps/web/tests/server/mcp/tools/list-catalog.test.ts
git commit -m "feat(mcp): list_catalog tool + wire all tool registrars"
```

---

## Phase 6 — Cross-company `not_found` per ID-taking tool

### Task 6.1: Single cross-company test file

**Files:**

- Create: `apps/web/tests/server/mcp/cross-company.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { getTestPrisma, stopTestPrisma, withTx } from '@tt/db/test';
import { createCompany } from '../../../src/lib/services/companies.js';
import { startTimer } from '../../../src/lib/services/time-entries.js';
import { buildInProcessMcp } from '../../_helpers/mcp.js';

beforeAll(async () => {
  await getTestPrisma();
}, 180_000);
afterAll(async () => {
  await stopTestPrisma();
}, 30_000);

async function twoCompanies(tx: Prisma.TransactionClient, suffix: string) {
  const ua = await tx.user.create({ data: { email: `xc-a-${suffix}@x.test`, fullName: 'A' } });
  const ub = await tx.user.create({ data: { email: `xc-b-${suffix}@x.test`, fullName: 'B' } });
  const ca = await createCompany(tx, { name: `A ${suffix}`, createdByUserId: ua.id });
  const cb = await createCompany(tx, { name: `B ${suffix}`, createdByUserId: ub.id });
  return { ua: ua.id, ub: ub.id, ca, cb };
}

describe('mcp cross-company not_found', () => {
  it('US-61: stop_timer for Company A entry returns not_found from a Company B token', async () => {
    await withTx(async (tx) => {
      const w = await twoCompanies(tx, 's');
      const a = await startTimer(tx, w.ua, { companyId: w.ca, description: 'A1' });
      if (!a.ok) throw new Error('setup');
      const m = await buildInProcessMcp({ db: tx, userId: w.ub, companyId: w.cb });
      try {
        const out = await m.client.callTool({
          name: 'stop_timer',
          arguments: { entryId: a.value.id },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('not_found');
        const errBody = JSON.parse(out.content?.[0]?.text ?? '{}') as { message?: string };
        expect(errBody.message ?? '').not.toMatch(/forbidden|permission/i);
      } finally {
        await m.close();
      }
    });
  });

  it('US-61: update_entry for Company A entry returns not_found from a Company B token', async () => {
    await withTx(async (tx) => {
      const w = await twoCompanies(tx, 'u');
      const a = await startTimer(tx, w.ua, { companyId: w.ca });
      if (!a.ok) throw new Error('setup');
      const m = await buildInProcessMcp({ db: tx, userId: w.ub, companyId: w.cb });
      try {
        const out = await m.client.callTool({
          name: 'update_entry',
          arguments: { entryId: a.value.id, description: 'x' },
        });
        expect(out.isError).toBe(true);
        expect((out.structuredContent as { code: string }).code).toBe('not_found');
      } finally {
        await m.close();
      }
    });
  });
});
```

- [ ] **Step 2: Run; expect PASS** (services already enforce membership)

Run: `pnpm --filter @tt/web vitest run tests/server/mcp/cross-company.test.ts`
Expected: PASS.

- [ ] **Step 3: Extend the audit static check**

Edit the last test in `apps/web/tests/services/audit.test.ts` to scan `src/server/mcp/` as well:

```ts
const mcpDir = path.resolve(here, '../../src/server/mcp');
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}
for (const f of walk(mcpDir)) {
  const src = fs.readFileSync(f, 'utf8');
  expect(src).not.toMatch(/\.auditLog\.(update|delete|deleteMany|updateMany)\(/);
}
```

- [ ] **Step 4: Run the audit test**

Run: `pnpm --filter @tt/web vitest run tests/services/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/server/mcp/cross-company.test.ts apps/web/tests/services/audit.test.ts
git commit -m "test(mcp): cross-company not_found + extend audit static check"
```

---

## Phase 7 — Settings UI (Czech) and server actions

### Task 7.1: Czech i18n keys

**Files:**

- Modify: `apps/web/messages/cs.json`

- [ ] **Step 1: Add the namespace**

Append under the root object (mind comma placement):

```json
"settings": {
  "apiTokens": {
    "title": "API tokeny",
    "subtitle": "Osobní tokeny pro připojení Claude Code (MCP).",
    "create": "Vytvořit token",
    "name": "Název",
    "company": "Firma",
    "createdAt": "Vytvořeno",
    "lastUsed": "Naposledy použit",
    "status": "Stav",
    "active": "Aktivní",
    "revoked": "Zrušený",
    "revoke": "Zrušit",
    "revokeConfirm": "Token nelze obnovit. Chcete jej opravdu zrušit?",
    "createdOnce": "Token zkopírujte teď. Po zavření jej už neuvidíme.",
    "copy": "Zkopírovat",
    "downloadConfig": "Stáhnout JSON pro Claude Code",
    "empty": "Zatím nemáte žádné tokeny."
  }
}
```

(If `settings` already exists, merge `apiTokens` into it.)

- [ ] **Step 2: Verify by typechecking the i18n namespace use**

Run: `pnpm --filter @tt/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/cs.json
git commit -m "feat(i18n): cs strings for settings.apiTokens"
```

### Task 7.2: Server actions

**Files:**

- Create: `apps/web/src/lib/actions/api-tokens.ts`

- [ ] **Step 1: Implement**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireSession } from '../auth/session.js'; // existing helper; confirm path
import { prisma } from '../db.js';
import { issueToken, revokeToken } from '../services/api-tokens.js';

export async function issueTokenAction(input: {
  companyId: string;
  name: string;
}): Promise<{ plaintext: string }> {
  const session = await requireSession();
  const res = await issueToken(prisma, session.userId, input);
  if (!res.ok) throw new Error('Cannot issue token.');
  revalidatePath('/settings/api-tokens');
  return { plaintext: res.value.plaintext };
}

export async function revokeTokenAction(input: { tokenId: string }): Promise<void> {
  const session = await requireSession();
  const res = await revokeToken(prisma, session.userId, input.tokenId);
  if (!res.ok) throw new Error('Cannot revoke token.');
  revalidatePath('/settings/api-tokens');
}
```

> Confirm the names: `requireSession` vs. `getSessionOrThrow`. Look at how `apps/web/src/lib/actions/time.ts` or another existing action imports it, and mirror.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/actions/api-tokens.ts
git commit -m "feat(actions): issue + revoke API token actions"
```

### Task 7.3: Settings page + components

**Files:**

- Create: `apps/web/src/app/(authenticated)/settings/api-tokens/page.tsx`
- Create: `apps/web/src/app/(authenticated)/settings/api-tokens/CreateTokenDialog.tsx`
- Create: `apps/web/src/app/(authenticated)/settings/api-tokens/RevokeTokenButton.tsx`
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx`

- [ ] **Step 1: Page (server component)**

```tsx
import { getTranslations } from 'next-intl/server';
import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { listTokens } from '@/lib/services/api-tokens';
import { CreateTokenDialog } from './CreateTokenDialog';
import { RevokeTokenButton } from './RevokeTokenButton';

export default async function ApiTokensPage(): Promise<JSX.Element> {
  const session = await requireSession();
  const t = await getTranslations('settings.apiTokens');
  const tokens = await listTokens(prisma, session.userId);
  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { company: { name: 'asc' } },
  });
  const companies = memberships.map((m) => ({ id: m.company.id, name: m.company.name }));

  return (
    <section className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <CreateTokenDialog companies={companies} />
      </header>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-2">{t('name')}</th>
              <th>{t('company')}</th>
              <th>{t('createdAt')}</th>
              <th>{t('lastUsed')}</th>
              <th>{t('status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tokens.map((tk) => {
              const company = companies.find((c) => c.id === tk.companyId);
              return (
                <tr key={tk.id} className="border-t">
                  <td className="py-2">
                    {tk.name} <code className="text-xs text-muted-foreground">{tk.prefix}…</code>
                  </td>
                  <td>{company?.name ?? '—'}</td>
                  <td>{tk.createdAt.toLocaleDateString('cs-CZ')}</td>
                  <td>{tk.lastUsedAt ? tk.lastUsedAt.toLocaleString('cs-CZ') : '—'}</td>
                  <td>{tk.revokedAt ? t('revoked') : t('active')}</td>
                  <td>{!tk.revokedAt && <RevokeTokenButton tokenId={tk.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

> Match the codebase's existing styling helpers (`cn`, button primitives in `packages/ui`). Don't introduce new design tokens — look at any other settings sub-page for the conventions to follow.

- [ ] **Step 2: CreateTokenDialog (client)**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { issueTokenAction } from '@/lib/actions/api-tokens';

export function CreateTokenDialog({
  companies,
}: {
  companies: { id: string; name: string }[];
}): JSX.Element {
  const t = useTranslations('settings.apiTokens');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    start(async () => {
      const r = await issueTokenAction({ companyId, name });
      setPlaintext(r.plaintext);
      setName('');
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        {t('create')}
      </button>
      {open && (
        <div role="dialog" aria-modal className="fixed inset-0 grid place-items-center bg-black/40">
          <div className="rounded bg-background p-6 shadow space-y-4 w-full max-w-md">
            {plaintext ? (
              <>
                <p>{t('createdOnce')}</p>
                <pre className="break-all rounded bg-muted p-3 text-sm">{plaintext}</pre>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(plaintext)}
                  className="btn-secondary"
                >
                  {t('copy')}
                </button>
                <a
                  className="btn-secondary"
                  download="claude-mcp.json"
                  href={`data:application/json,${encodeURIComponent(
                    JSON.stringify(
                      {
                        mcpServers: {
                          'time-tracking': {
                            type: 'http',
                            url: `${window.location.origin}/api/mcp`,
                            headers: { Authorization: `Bearer ${plaintext}` },
                          },
                        },
                      },
                      null,
                      2,
                    ),
                  )}`}
                >
                  {t('downloadConfig')}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setPlaintext(null);
                  }}
                  className="btn-primary"
                >
                  OK
                </button>
              </>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                  <span>{t('name')}</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full"
                  />
                </label>
                <label className="block">
                  <span>{t('company')}</span>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="input w-full"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)}>
                    Zrušit
                  </button>
                  <button type="submit" disabled={pending} className="btn-primary">
                    {t('create')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: RevokeTokenButton (client)**

```tsx
'use client';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { revokeTokenAction } from '@/lib/actions/api-tokens';

export function RevokeTokenButton({ tokenId }: { tokenId: string }): JSX.Element {
  const t = useTranslations('settings.apiTokens');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(t('revokeConfirm'))) return;
        start(() => revokeTokenAction({ tokenId }));
      }}
    >
      {t('revoke')}
    </button>
  );
}
```

- [ ] **Step 4: Link from settings index**

Add a row/link to `/settings/api-tokens` inside `apps/web/src/app/(authenticated)/settings/page.tsx`. Mirror the pattern other rows use (TOTP, password).

- [ ] **Step 5: Smoke run + typecheck**

Run: `pnpm --filter @tt/web typecheck && pnpm --filter @tt/web dev`, open `http://localhost:3000/settings/api-tokens`, sanity-check the page renders. Ctrl-C the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(authenticated\)/settings
git commit -m "feat(settings): API tokens management page"
```

---

## Phase 8 — Playwright E2E for the full skill flow

### Task 8.1: E2E spec

**Files:**

- Create: `apps/web/tests/e2e/mcp-skill-flow.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('US-55: a user issues a token, plugs it into a real MCP client, lists running entries', async ({
  page,
  baseURL,
}) => {
  // Assumes the existing E2E fixture creates a logged-in user with one company.
  await page.goto('/settings/api-tokens');
  await page.getByRole('button', { name: /Vytvořit token/ }).click();
  await page.getByLabel('Název').fill('E2E');
  await page.getByRole('button', { name: /Vytvořit token/ }).click();

  const pre = page.locator('pre');
  await expect(pre).toBeVisible();
  const token = (await pre.textContent())?.trim() ?? '';
  expect(token).toMatch(/^tt_pat_/);

  // Now act as an MCP client.
  const transport = new StreamableHTTPClientTransport(new URL(`${baseURL}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: 'e2e', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const out = await client.callTool({ name: 'list_running_entries', arguments: {} });
  expect(out.isError).toBeFalsy();
  await client.close();
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm --filter @tt/web exec playwright test mcp-skill-flow`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/mcp-skill-flow.spec.ts
git commit -m "test(e2e): MCP skill flow — issue token, real client round-trip"
```

---

## Phase 9 — Docs, trace cap, US registry

### Task 9.1: Append US-55..63 to features.md and acceptance.md

**Files:**

- Modify: `docs/reference/features.md`
- Modify: `docs/reference/acceptance.md`

- [ ] **Step 1: Update header range and append entries**

In `features.md`, change line 1:

```diff
-# Features (US-1 … US-53)
+# Features (US-1 … US-63)
```

Append at the end:

```md
- **US-55** — User issues a personal MCP token scoped to one company; plaintext shown exactly once; subsequent loads show only the prefix.
- **US-56** — User lists and revokes their MCP tokens; revocation is immediate.
- **US-57** — `list_running_entries` returns every currently running entry for the authenticated user as an array (possibly empty).
- **US-58** — `start_timer` opens a new running entry and broadcasts `timer.started`; other running entries are left alone.
- **US-59** — `update_entry` with an explicit `entryId` patches fields; one audit row written with `source = 'mcp'`.
- **US-60** — `stop_timer` with an explicit `entryId` ends that entry and broadcasts `timer.stopped`.
- **US-61** — A token scoped to Company A targeting Company B's entry returns the MCP `not_found` error (no existence leak).
- **US-62** — A revoked token returns HTTP `401` on every call.
- **US-63** — A token over the rate limit returns HTTP `429` with `Retry-After`; next bucket allows again.
```

Mirror the format in `acceptance.md` with the matching acceptance rows.

- [ ] **Step 2: Bump the trace cap**

Edit `scripts/test-trace.ts`:

```diff
-const TOTAL_US = 54;
+const TOTAL_US = 63;
```

- [ ] **Step 3: Run trace**

Run: `pnpm test:trace`
Expected: 100% (63/63).

- [ ] **Step 4: Commit**

```bash
git add docs/reference/features.md docs/reference/acceptance.md scripts/test-trace.ts
git commit -m "docs(features): register US-55..63 and bump trace cap"
```

### Task 9.2: ADR + ops doc + DESCRIPTION.md

**Files:**

- Create: `docs/decisions/0008-mcp-server.md`
- Create: `docs/operations/mcp-server.md`
- Create: `apps/web/src/server/mcp/DESCRIPTION.md`

- [ ] **Step 1: ADR**

Use `docs/decisions/_template.md`. Capture:

- **Status:** Accepted.
- **Decision:** Add `@modelcontextprotocol/sdk` to the locked stack. Single in-process route handler at `POST /api/mcp` in `apps/web`. Personal API tokens (argon2id-hashed) over OAuth 2.1 DCR. Stateless streamable-HTTP transport. `AuditLog.source` enum column.
- **Consequences:** new dependency surface; existing services stay unchanged except for an optional `audit.source` arg.

- [ ] **Step 2: Ops doc**

`docs/operations/mcp-server.md` — concise. Include:

- Endpoint URL pattern (`https://<host>/api/mcp`)
- Required header (`Authorization: Bearer tt_pat_…`)
- Example Claude Code config snippet (`~/.claude.json` or project `.mcp.json`)
- Rate-limit + error-shape reference (`401`, `429`, tool `_meta.code` taxonomy)
- The example skill loop from the spec

- [ ] **Step 3: DESCRIPTION.md**

`apps/web/src/server/mcp/DESCRIPTION.md`:

- **Purpose:** token-authenticated MCP server.
- **Public surface:** `POST /api/mcp` (route), `buildMcpServer` (router), `authenticateRequest` (auth).
- **Dependencies:** `lib/services/api-tokens`, `lib/services/time-entries`, `lib/services/catalog`, `lib/auth/passwords`, `lib/api/rate-limit-ip` (pattern source), `@modelcontextprotocol/sdk`.
- **Used by:** `app/api/mcp/route.ts`; tests in `tests/server/mcp/`.
- **Notes:** tool handlers stay thin — all business logic lives in `lib/services/*`.

- [ ] **Step 4: Mark the spec implemented**

Edit `docs/superpowers/specs/2026-05-15-mcp-server-design.md` line 3:

```diff
-**Status**: design approved, awaiting implementation plan
+**Status**: implemented
```

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0008-mcp-server.md docs/operations/mcp-server.md apps/web/src/server/mcp/DESCRIPTION.md docs/superpowers/specs/2026-05-15-mcp-server-design.md
git commit -m "docs(mcp): ADR + ops doc + DESCRIPTION; mark spec implemented"
```

---

## Phase 10 — Final verification

### Task 10.1: Full local check before opening the PR

**Files:** —

- [ ] **Step 1: Lint + typecheck + tests + trace**

Run: `pnpm test:all`
Expected: 100% green.

- [ ] **Step 2: Build the web app**

Run: `pnpm --filter @tt/web build`
Expected: completes without errors.

- [ ] **Step 3: Manual smoke from a real Claude Code client**

Run the dev stack: `pnpm dev`. In another terminal, configure Claude Code with the issued token, run `/mcp` and verify the six tools list. Try `list_running_entries`, `start_timer`, `update_entry`, `stop_timer` end-to-end. Confirm the browser tab open at `/timer` reflects each change (WS broadcast).

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/mcp-server
gh pr create --title "feat(mcp): personal MCP server with token auth (US-55..63)" --body "..."
```

PR body should link to the spec, the plan, and call out the migration, the new audit column, and the new dependency.

---

## Self-review notes

- **Spec coverage:** every US (55..63) maps to at least one task — US-55 (Task 3.1 + 7.3 + 8.1), US-56 (3.1 + 7.3), US-57 (2.3 + 5.1), US-58 (5.3), US-59 (5.5 + 2.2), US-60 (5.4), US-61 (6.1), US-62 (3.1 + 4.3), US-63 (4.1 + 4.3).
- **No `billable` arg** anywhere (the column doesn't exist; spec was wrong, plan dropped it).
- **Multi-tenant 404:** services already enforce membership; cross-company tests (Task 6.1) confirm; collapse `forbidden → not_found` in `errors.ts`.
- **Audit invariants:** mutations route through `lib/services/*` → `writeAudit`; tool tests assert `auditCount` and `source = 'mcp'`; static check extended to scan `src/server/mcp/`.
- **No Czech in LLM-facing strings;** all tool descriptions are English. Settings UI is Czech via `next-intl`.
- **No `setTimeout` in tests, no `console.log` in `apps/`, no `.only/.skip`** — all conform.
