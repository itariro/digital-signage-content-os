# PR #14 Remediation Plan — Security, Sync Correctness, Standards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Start work in a fresh worktree per repo AGENTS.md (`/new-feature`, branch `fix/pr14-remediation` from `origin/main`).

**Goal:** Close every Critical/High defect and the hard standards violations from `docs/superpowers/reviews/2026-10-21-pr14-adversarial-review.md` so the local-first sync platform is authenticated, correct on both dialects, and actually delivers queued changes at-least-once with real conflicts.

**Architecture:** Same service-layer shape as the original plans — routes orchestrate, `lib/sync`/`lib/assets`/`lib/console` own the "how" with explicit inputs and structured returns. Auth is Clerk for humans (`/console`, admin APIs) and device tokens for instances (sync APIs), with ownership scoping enforced server-side. The typed `getDb()`/`getTables()` union replaces `as any` so dialect drift (the PG missing-columns class of bug) fails typecheck.

**Tech Stack:** Next.js 16 App Router, Clerk (`@clerk/nextjs`), Drizzle (sqlite+pg), zod, nanoid, vitest, `crypto.timingSafeEqual`.

**Definition of done:** every task's tests green; `tsc --noEmit` clean with **zero `as any` in `lib/` + `app/api` diffs of this plan**; vitest run **with `DATABASE_URL`** so the pg path executes; e2e sync round-trip test committed (replaces the unproven "e2e sync verified" claim); before/after evidence captured per repo ship beat.

---

## File map (new/changed, by area)

- `proxy.ts`, `lib/authz.ts` (new) — Clerk protection + fail-closed admin/device auth
- `app/api/instances/**`, `app/console/page.tsx` — authorization
- `app/api/sync/{push,pull,ack,run}/route.ts` + `lib/sync/{server,queue,client,worker,conflicts}.ts` — IDOR scoping, conflict protocol, durability
- `lib/db/schema.pg.ts`, `drizzle/0001_…sql`, `lib/db/{index,tables}.ts` — PG sync columns, typed accessors
- `lib/store.ts` — echo suppression, mode-gated enqueue, logged enqueue failure
- `public/sw.js` — network-first APIs, versioned caches
- `app/api/assets/**`, `lib/assets/*` — auth, mime allowlist, refcount wiring
- `lib/sync/__tests__/*`, `tests/e2e-sync.test.ts` (new) — Stage-3 tests the plan owed

---

## Wave 1 — Stop the bleeding (Critical security: C1–C5)

### Task 1: Clerk-protect the console and admin APIs (C1, C2)

**Files:** `proxy.ts`, `lib/authz.ts` (new), `app/console/page.tsx`, `app/api/instances/**`, `lib/admin.ts`

- [ ] **Step 1: Write failing tests** — `lib/__tests__/authz.test.ts`: `requireAdmin()` rejects when `CONSOLE_ADMIN_TOKEN` unset (fail-**closed** in production; dev-open only behind explicit `NODE_ENV !== 'production'`), uses constant-time compare, rejects wrong token.
- [ ] **Step 2: Configure Clerk middleware** in `proxy.ts`: `clerkMiddleware(({ auth, req }) => { auth.protect() })` for `/console(.*)` and admin/API namespaces that are human-facing; instance device-token routes (`/api/sync/*`) stay on bearer auth — matcher must not lock the kiosk out.
- [ ] **Step 3: Rewrite `lib/admin.ts`** to a `requireAdmin(request)` that returns a structured `{ ok, reason }`, fails closed when the env token is missing, and compares with `crypto.timingSafeEqual` over sha256 digests (fixes M5 at the same time).
- [ ] **Step 4: Gate `GET /api/instances`** and `/console` behind Clerk + admin role; audit actor = `userId` from Clerk (fixes §10 "actor hardcoded 'admin'").
- [ ] **Step 5: Run tests, `tsc`, lint; commit** `fix(auth): protect console and admin APIs; fail-closed admin token`.

### Task 2: Ownership-scoped sync endpoints (C3)

**Files:** `lib/sync/server.ts` (new), `app/api/sync/{push,pull}/route.ts`, `app/api/instances/route.ts`

- [ ] **Step 1: Write failing e2e test** `tests/e2e-sync.test.ts` (sqlite, real route handlers): instance A registers, pushes a doc; instance B (separate token) attempts push/delete against A's `entityId` → **403/ignored**; B's pull must not contain A's docs.
- [ ] **Step 2: Add frame ownership to instances** — `instances.frames` (already registered with frame IDs) is the authorization source; derive `instanceId` from the **authenticated token**, not the body (`authenticateInstance` already returns it — stop trusting `body.instanceId`).
- [ ] **Step 3: Extract `lib/sync/server.ts` service** owning the push loop (idempotency, conflict, upsert) with explicit inputs `{ instanceId, apiVersion, changes }` and structured return `{ accepted, conflicts, rejected[] }`; route only orchestrates. Reject changes whose `entityId` is not owned by the instance.
- [ ] **Step 4: Scope `pull`** to the instance's frames; use SQL-side filtering + `updatedAt` cursor instead of full-table slice (fixes M6 for pull).
- [ ] **Step 5: Run e2e test green; commit** `fix(sync): ownership-scoped push/pull`.

### Task 3: Lock down `/api/sync/run` (C5)

**Files:** `app/api/sync/run/route.ts`, `lib/sync/client.ts`

- [ ] **Step 1: Failing test:** POST with attacker-supplied `endpoint` is rejected; SSRF to non-allowlisted host rejected.
- [ ] **Step 2: Remove `endpoint`/`token` from the request body.** `run` reads config from instance env (`SYNC_ENDPOINT`, stored device token) only; requires instance-mode auth (admin token or `localhost`-only kiosk binding, per existing remote-fetch allowlist).
- [ ] **Step 3: Commit** `fix(sync): sync-run uses server-side config only`.

### Task 4: Authenticate assets, kill stored XSS (H4)

**Files:** `app/api/assets/route.ts`, `app/api/assets/[id]/route.ts`, `lib/assets/storage.ts`

- [ ] **Step 1: Failing tests:** unauthenticated upload → 401; upload with `data:text/html,…` served back with sanitized `Content-Type`; oversize/over-count rejected.
- [ ] **Step 2: Auth uploads** via Clerk (editor) or instance bearer token (console ingest).
- [ ] **Step 3: Mime allowlist** (`image/*`, `video/*`, fonts per spec §7); ignore client-declared type — sniff/derive from stored hash path; serve with `X-Content-Type-Options: nosniff`, `Content-Disposition` for non-display types; SVG either sanitized or served as `text/plain`.
- [ ] **Step 4: Enforce per-instance storage quota** (count+bytes).
- [ ] **Step 5: Commit** `fix(assets): authenticated upload with mime allowlist and nosniff delivery`.

---

## Wave 2 — Make sync actually work (H1, H2, H5, C4, M2, M3, spec §5.2/8.x)

### Task 5: PG schema parity — revision/contentHash/updatedBy on frame_documents (C4)

**Files:** `lib/db/schema.pg.ts`, `drizzle/0001_*.sql` (generate), `lib/__tests__/persist.pg.test.ts` (new)

- [ ] **Step 1: Failing test** (pg, gated on `DATABASE_URL` but **required in CI**): `persist()` on console mode writes and increments `revision`; conflicts path reads it.
- [ ] **Step 2: Add the three columns** to pg `frame_documents`; `drizzle-kit generate`; regenerate, don't hand-merge.
- [ ] **Step 3: Run vitest with `DATABASE_URL`** — capture before/after (before: crash/drop; after: green). Commit `fix(db): pg frame_documents sync columns`.

### Task 6: Correct conflict protocol (H1) — spec §5.2 + §8.4

**Files:** `lib/sync/types.ts`, `lib/store.ts`, `lib/sync/queue.ts`, `lib/sync/client.ts`, `lib/sync/server.ts`

- [ ] **Step 1: Failing conflict tests** (the Stage-3 plan's owed `conflicts.test.ts`): (a) true concurrent edit → conflict recorded, **local row preserved with status `conflict`**, nothing deleted; (b) clean push after remote advanced only via **this instance's own earlier push** → no conflict; (c) retry after network failure reuses key and is idempotent.
- [ ] **Step 2: Carry `baseRevision`** in queue rows (`enqueueChange` gets it from the persisted revision at mutate time) and include `revision` in the payload snapshot; push compares `baseRevision` vs remote — conflict only on genuine divergence.
- [ ] **Step 3: Fix the retry trap:** conflict responses must **not** burn the idempotency key into the accepted set; client transitions the item to `conflict` status (new enum value, spec §8.1 status set `pending/inflight/done/failed/conflict`) surfaced via `/api/sync/status` and the console list.
- [ ] **Step 4: Wire `listConflicts` into `/console`** with resolve UI (spec §5.2 L122; kills the Speculative-Generality smell on `resolveConflict` by giving it a caller).
- [ ] **Step 5: Commit** `fix(sync): baseRevision-based conflict detection with visible conflict state`.

### Task 7: Durable queue (H5, M1) — spec §8.1

**Files:** `lib/sync/queue.ts`, `lib/store.ts`

- [ ] **Step 1: Failing tests:** crash-after-`markInflight` → item reclaimed after timeout and re-delivered; enqueue failure after commit → logged with context; max-attempts → `failed` dead-letter, still visible.
- [ ] **Step 2: Reclaim logic** — `getPending` also selects `inflight` older than `inflightTimeoutMs`; `markInflight` stamps `attemptedAt`.
- [ ] **Step 3: Dead-letter** at `attempts >= MAX_ATTEMPTS` (set `failed`, keep row); `markDone` keeps a lightweight `delivered` tombstone or uses the idempotency table as the delivery record (M3/M4 audit trail).
- [ ] **Step 4: `store.ts:300`** — replace bare catch with `console.error('sync enqueue failed', …)` (parent AGENTS.md error rule).
- [ ] **Step 5: Commit** `fix(sync): inflight reclaim, dead-letter, logged enqueue failures`.

### Task 8: Break the pull echo loop (H2)

**Files:** `lib/store.ts`, `lib/sync/client.ts`

- [ ] **Step 1: Failing test:** runSyncCycle(push+pull) twice on idle system → queue depth stays 0, console revision unchanged.
- [ ] **Step 2: `mutateStore(fn, frameId, opts?: { source?: 'remote' })`** — skip enqueue (and skip revision-bump? no: apply remote revision as authoritative) when `source === 'remote'`; `pullRemote` passes it.
- [ ] **Step 3: Commit** `fix(sync): remote-applied changes do not re-enqueue`.

### Task 9: Checkpoints + real ack (M2, M3)

**Files:** `lib/sync/worker.ts`, `lib/sync/client.ts`, `app/api/sync/ack/route.ts`, `lib/sync/server.ts`

- [ ] **Step 1: Failing tests:** after cycle, cursor persisted to `sync_checkpoints` (client-side table exists in both dialects); next pull sends `since`; server validates window and answers 410 beyond retention (already client-handled).
- [ ] **Step 2: Worker stores returned cursor**; reads it on next tick.
- [ ] **Step 3: Delete `/api/sync/ack` or give it meaning** (prefer delete — pull cursor + idempotency keys already cover acknowledgement; spec §8 didn't ask for a third mechanism). If kept, it must write durable state.
- [ ] **Step 4: Commit** `fix(sync): persist checkpoints; drop fake ack`.

### Task 10: Mode-aware enqueue + validated config push (spec §9)

**Files:** `lib/store.ts`, `lib/db/mode.ts`, `app/api/instances/[id]/config/route.ts`

- [ ] **Step 1: Failing tests:** enqueue active when mode resolves to instance via `getDatabaseMode()` (not raw env compare); config push with invalid shape → 400, DB untouched; valid push applies atomically, invalid leaves last-known-good.
- [ ] **Step 2: Replace `process.env.FRAME_MODE === 'instance'`** with the resolver.
- [ ] **Step 3: zod-validate the config patch against `FrameStore`**, merge then `normalize()` before write, bump revision, run inside the per-frame serialization queue.
- [ ] **Step 4: Commit** `fix(sync): resolver-gated enqueue; zod-validated config push`.

---

## Wave 3 — Client + lifecycle (H3, spec §6/§4.2)

### Task 11: Fix the service worker (H3)

**Files:** `public/sw.js`, `components/sw-register.tsx`

- [ ] **Step 1: Failing test** (node-level, against the SW script or a small extracted strategy module): `/api/*` GETs are never served from static cache; navigation is network-first with offline fallback to cached shell.
- [ ] **Step 2: Strategy split** — `frame-static-v2` (shell, precached, stale-while-revalidate), `frame-api` **network-first, no-store fallback** or excluded entirely; bump cache name; `skipWaiting` + `clients.claim`; add versioned unregister step so already-bricked kiosks recover (document in `docs/operations.md`).
- [ ] **Step 3: Commit** `fix(pwa): network-first APIs, versioned caches, takeover`.

### Task 12: Wire backup + migration runner into lifecycle (spec §6)

**Files:** `lib/lifecycle/index.ts`, `lib/backup/index.ts`, `lib/db/migrate.ts`

- [ ] **Step 1: Failing tests:** startup with corrupt sqlite file triggers restore-from-latest-backup path (or explicit degraded mode + logged error, spec §4.2); `createSnapshot` called before each migration step; rotation keeps N.
- [ ] **Step 2:** Migration runner records applied versions in a `_migrations` table, wraps each step in a transaction, snapshots first.
- [ ] **Step 3:** `rotateBackups` + `createSnapshot` get callers (startup + schedule via existing worker tick, or cron doc).
- [ ] **Step 4: Commit** `fix(lifecycle): backups wired, versioned migrations, restore on corruption`.

---

## Wave 4 — Standards / architecture debt (Sections 5–6 of the review)

### Task 13: Kill `as any` at the root

**Files:** `lib/db/index.ts`, `lib/db/tables.ts`, + 17 call sites

- [ ] **Step 1:** Define a union return type for `getDb()` and a `Tables` discriminated-by-mode type for `getTables()` (shared column-name type with dialect-typed driver wrappers); export helpers for dialect branches (the txn switch in `db/index.ts:77–105`).
- [ ] **Step 2:** Convert call sites mechanically; `catch (e: unknown)` + narrowing. Move module-level `const { x } = getTables()` out of import side effects (`store.ts:12`, `frames/route.ts:6`, `sources/route.ts:7`).
- [ ] **Step 3:** `tsc` clean; grep gate: `grep -rn "as any" lib app/api` → zero in touched files. Commit `refactor(db): typed dialect dispatch replaces as-any`.

### Task 14: Service-layer extraction + shared helpers

**Files:** `lib/sync/server.ts` (done in T2), `lib/console/service.ts` (new), `lib/assets/service.ts` (new), `lib/frames/request.ts` (new)

- [ ] **Step 1:** Move push/pull/instances/assets "how" logic out of routes; structured returns; routes = parse → authorize → delegate → respond.
- [ ] **Step 2:** `getFrameId(request)` helper replacing the 11-site `new URL(request.url).searchParams.get('frame')` duplication.
- [ ] **Step 3:** Replace remaining bare `catch {}` with contextual logging; move hero's inline style to Tailwind/CSS-var; rename `dh()`/`tables()`/`db2`/`adminOk` to intent-revealing names.
- [ ] **Step 4: Commit** `refactor: service-layer extraction per code-structure standard`.

---

## Wave 5 — Prove it (evidence + ship beat)

### Task 15: e2e sync verification suite (the missing Stage-3 tests)

- [ ] **Round-trip:** instance write → console sees doc; console write → instance sees doc; queue drains to 0; revisions converge (run on sqlite **and** pg with `DATABASE_URL`).
- [ ] **Interrupted:** kill mid-inflight → restart → change delivered exactly-once (idempotency key dedup).
- [ ] **Duplicate push:** same batch twice → second fully "accepted" no-ops.
- [ ] **Conflict:** divergent edits → conflict row, visible in `/api/sync/status` + console list, resolvable.
- [ ] **Ownership:** cross-instance push/pull attempts rejected (from T2).
- [ ] **No-echo:** two idle cycles queue depth 0 (from T8).

### Task 16: Ship

- [ ] Run `npx tsc --noEmit`, `npx vitest run` (with `DATABASE_URL`), `npm run lint`, `npm run build`; capture before/after evidence per repo AGENTS.md (before-state from the failing tests in each task).
- [ ] `/before-and-after` + PR body with evidence table; `/greploop` (or `/greploop-apps` — this will exceed file limits, expect the apps variant) until 5/5 with zero unresolved comments.
- [ ] Update `docs/operations.md` (admin token required, Clerk setup, kiosk SW recovery) and `docs/agents`-level run notes if any invariant changed.

---

## Explicitly deferred (tracked, not in this plan)

- Spec §5.3 Bob history decoupling (needs its own design pass — never had a stage plan).
- §12.4 media→asset backfill, §12.5 kiosk-conf token migration (data migrations; sequence after Wave 2 lands).
- Roadmap `frame_templates` removal.
- Console health/heartbeat/capabilities columns (§4.3) and offline indicator (Stage-2 T14) — UI polish, file separate issues.
- §7.1 asset path layout + §7.2 versioning/soft-delete — decide layout before any asset migration; current flat layout works, revisit with backfill.
