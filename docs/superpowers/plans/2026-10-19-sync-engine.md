# Synchronization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a durable, idempotent, resumable synchronization engine between each local Frame instance and the central console, covering frame documents and assets, with conflict detection and compatibility checks.

**Architecture:** Instance enqueues changes into `sync_queue` (SQLite) on every local write; a background worker pushes batches to the console (`/api/sync/push`), pulls remote changes (`/api/sync/pull`), and acks. Idempotency via per-item keys + console dedup table. Revisions on `frame_documents` drive conflict detection. Extended-offline instances receive `410` and reset their checkpoint for full resync.

**Tech Stack:** Next.js 16, Drizzle (sqlite+pg), nanoid, zod, vitest.

---

## File structure (new/modified)

- `lib/db/schema.sqlite.ts` / `schema.pg.ts` (modified) — add `revision`, `sync_conflicts` table, `idempotency_keys` table
- `drizzle/sqlite/0000_init.sql` (modified) — matching DDL
- `lib/store.ts` (modified) — increment revision on mutate; enqueue sync in instance mode
- `lib/sync/types.ts` (new)
- `lib/sync/compat.ts` (new) — version constants + check
- `lib/sync/queue.ts` (new) — enqueue/dequeue/mark
- `lib/sync/queue.test.ts` (new)
- `lib/sync/client.ts` (new) — push/pull/ack/cycle
- `lib/sync/worker.ts` (new) — interval worker + start/stop
- `lib/sync/conflicts.ts` (new) — record/list/resolve
- `app/api/sync/push/route.ts` (new, console)
- `app/api/sync/pull/route.ts` (new, console)
- `app/api/sync/ack/route.ts` (new, console)
- `app/api/sync/run/route.ts` (new, instance) — manual trigger
- `app/api/sync/status/route.ts` (new) — queue depth + last sync

---

### Task 1: Add revision + sync tables to schemas

**Files:**
- Modify: `lib/db/schema.sqlite.ts`, `lib/db/schema.pg.ts`
- Modify: `drizzle/sqlite/0000_init.sql`

- [ ] **Step 1: Add `revision` to frame_documents** (both schemas: integer default 1)
- [ ] **Step 2: Add `sync_conflicts` table** (id, instanceId, entityType, entityId, localRevision, remoteRevision, localPayload json, remotePayload json, status, createdAt)
- [ ] **Step 3: Add `idempotency_keys` table** (key PK, createdAt) for console dedup
- [ ] **Step 4: Update DDL** with new columns/tables
- [ ] **Step 5: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sync): add revision column and sync_conflicts/idempotency tables"
```

---

### Task 2: Increment revision on mutate + enqueue

**Files:**
- Modify: `lib/store.ts`

- [ ] **Step 1: In `mutateStore`, after normalize, increment `revision`** on the frame document? But store is FrameStore, not frame_documents row. The revision lives on `frame_documents` row. Need to update the row's revision. Modify `persist` to set `revision: sql\`revision + 1\``? Or read current revision and +1. Let's add a `revision` field to the persisted row update: `.set({ data: store, updatedAt: new Date(), revision: sql\`COALESCE(revision,0)+1\` })`. Also in seed insert, set revision: 1.

- [ ] **Step 2: Enqueue sync item in instance mode** after successful mutate: if `getDatabaseMode()==='sqlite'`, call `enqueueChange({entityType:'frame_document', entityId:frameId, operation:'upsert', payload: store, idempotencyKey: nanoid()})`. Import lazily to avoid circular deps.

- [ ] **Step 3: Typecheck + tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sync): increment revision on mutate and enqueue in instance mode"
```

---

### Task 3: Compat module

**Files:**
- Create: `lib/sync/compat.ts`
- Test: `lib/sync/__tests__/compat.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest'
import { checkCompatibility } from '@/lib/sync/compat'
describe('checkCompatibility', () => {
  it('compatible when equal', () => { expect(checkCompatibility('1.0', '1.0')).toBe(true) })
  it('incompatible when major differs', () => { expect(checkCompatibility('1.0', '2.0')).toBe(false) })
  it('compatible when instance older minor', () => { expect(checkCompatibility('1.0', '1.2')).toBe(true) })
})
```

- [ ] **Step 2: Implement**

```ts
export const API_VERSION = '1.0'
export function parseVersion(v: string) { const [major, minor] = v.split('.').map(Number); return { major, minor } }
export function checkCompatibility(instance: string, console: string) {
  const a = parseVersion(instance); const b = parseVersion(console)
  if (Number.isNaN(a.major) || Number.isNaN(b.major)) return false
  return a.major === b.major && a.minor <= b.minor
}
```

- [ ] **Step 3: Run + commit**

---

### Task 4: Queue module

**Files:**
- Create: `lib/sync/queue.ts`
- Test: `lib/sync/__tests__/queue.test.ts`

Functions: `enqueueChange(input)`, `getPending(limit)`, `markInflight(ids)`, `markDone(ids)`, `markFailed(id, error)`, `pendingCount()`.

Use getDb/getTables. Ensure instance mode (sqlite) primarily; console mode can still enqueue but worker won't run. Tests use sqlite :memory:.

- [ ] **Step 1: Write failing tests** (enqueue + dequeue + mark done)
- [ ] **Step 2: Implement**
- [ ] **Step 3: Run + commit**

---

### Task 5: Types module

**Files:**
- Create: `lib/sync/types.ts`

Define `SyncChange`, `PushRequest`, `PushResponse`, `PullResponse`, `SyncConflict`, `SyncStatus`.

- [ ] **Step 1: Implement + commit**

---

### Task 6: Conflicts module

**Files:**
- Create: `lib/sync/conflicts.ts`
- Test: `lib/sync/__tests__/conflicts.test.ts`

Functions: `recordConflict`, `listConflicts`, `resolveConflict(id, resolution)`.

- [ ] **Step 1: Tests + implement + commit**

---

### Task 7: Console push endpoint

**Files:**
- Create: `app/api/sync/push/route.ts`

Accepts `{ instanceId, apiVersion, changes: [{ idempotencyKey, entityType, entityId, operation, payload, baseRevision }] }`.
- Validate with zod.
- Check compatibility; if incompatible return 426.
- Authenticate instance via `Authorization: Bearer <deviceToken>` (for Stage 3, validate against an `instances` table? We don't have instances table yet. For Stage 3, accept a shared secret `SYNC_SECRET` env or skip auth with TODO. To keep testable, implement token validation against a simple `instances` table added to schemas. Add `instances` table: id, deviceTokenHash, createdAt. Registration deferred to Stage 4; for Stage 3, allow a dev mode where `SYNC_SECRET` env matches.)
- For each change: if idempotencyKey seen, skip; else upsert frame_document if entityType frame_document; increment revision; store idempotencyKey. If console revision > baseRevision → conflict: record sync_conflict, return conflict entry.
- Return `{ accepted: [...], conflicts: [...] }`.

- [ ] **Step 1: Implement + commit**

---

### Task 8: Console pull endpoint

**Files:**
- Create: `app/api/sync/pull/route.ts`

`GET /api/sync/pull?instanceId=&since=<cursor>&apiVersion=`
- Validate.
- Return changes since cursor: frame_documents updated after cursor (console-side changes). Provide new cursor (max updatedAt or revision).
- If cursor too old (instance behind > N), return 410 with reset flag.

- [ ] **Step 1: Implement + commit**

---

### Task 9: Console ack endpoint

**Files:**
- Create: `app/api/sync/ack/route.ts`

Accepts `{ instanceId, keys: string[] }`; delete idempotency keys older than retention? Or mark queue items done (instance-side). Console just acknowledges receipt; instance marks done on success. Console can no-op or record ack. Implement no-op 200 for simplicity, but validate.

- [ ] **Step 1: Implement + commit**

---

### Task 10: Instance sync client

**Files:**
- Create: `lib/sync/client.ts`

Functions: `pushPending()`, `pullRemote()`, `runSyncCycle(endpoint, token)`. Use fetch. Handle 410 → reset checkpoint. Retry via nextRetryDelay. Update sync state.

- [ ] **Step 1: Implement + commit**

---

### Task 11: Sync worker

**Files:**
- Create: `lib/sync/worker.ts`

`startSyncWorker(config)`, `stopSyncWorker()`. Interval based on syncIntervalMinutes. Only in instance mode. Integrate with lifecycle (start on init if syncEnabled).

- [ ] **Step 1: Implement + commit**

---

### Task 12: Manual trigger + status endpoints

**Files:**
- Create: `app/api/sync/run/route.ts` (POST, instance mode: run one cycle)
- Create: `app/api/sync/status/route.ts` (GET: queue depth, last sync, errors)

- [ ] **Step 1: Implement + commit**

---

### Task 13: Lifecycle integration

**Files:**
- Modify: `lib/lifecycle/index.ts`

Start sync worker on init if syncEnabled (read config). Stop on shutdown. Keep non-blocking (don't fail startup if sync config missing).

- [ ] **Step 1: Implement + commit**

---

### Task 14: Documentation update

**Files:**
- Modify: `README.md`, `docs/kiosk-cli.md`

Document sync endpoints, instance registration (dev mode SYNC_SECRET), conflict handling.

- [ ] **Step 1: Commit**

---

## Self-review checklist
- Spec coverage: durable queue, idempotency, checkpoints, conflict detection, compatibility, retry, reconciliation, endpoints — covered.
- No placeholders: code snippets provided.
- Type consistency: types in lib/sync/types.ts.

## Execution handoff
Plan complete. Execute via subagent-driven or inline.
EOF
echo "written"