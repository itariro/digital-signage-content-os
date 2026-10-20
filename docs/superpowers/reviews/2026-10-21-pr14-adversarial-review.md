# Adversarial Review — PR #14 (local-first multi-frame platform, Stages 2–6 + Clerk auth)

**Reviewed:** 2026-10-21 · **Range:** `084e601...94b58b3` (79 files, +4309/−158) · **Method:** three-axis
review (Standards / Spec / Defects) with every Critical finding re-verified against source by the
lead reviewer.

**Verification state:** `tsc --noEmit` clean. `vitest run` → 190 passed, 2 skipped (192). The 2
skips are pre-existing `history.integration.test.ts` (needs `DATABASE_URL`) — **no test ever
exercises the Postgres path, the push/pull routes end-to-end, or the auth surface.**

**Verdict: not production-safe.** The sync engine's central guarantees (conflict detection,
at-least-once delivery, checkpoints) are non-functional as specified; the platform is
unauthenticated end-to-end. Stages 3–4 must be treated as unproven.

---

## 1. Critical defects (all independently verified in source)

| # | Finding | Evidence |
|---|---------|----------|
| C1 | **Nothing is authenticated.** Bare `clerkMiddleware()` with no `protect()`; only `app/page.tsx` reads `auth()`. `/console` publicly renders all instance IDs, frame revisions, and the audit log. `GET /api/instances` requires no credential. | `proxy.ts:3`, `app/console/page.tsx:7–12`, `app/api/instances/route.ts:15–28` |
| C2 | **Admin gate fails open.** `if (!token) return true` — with `CONSOLE_ADMIN_TOKEN` unset (default deploy) anyone can register instances (mint device tokens), revoke any instance, push arbitrary config into any frame. | `lib/admin.ts:5`, `app/api/instances/route.ts:31`, `app/api/instances/[id]/route.ts:11`, `.../config/route.ts:12` |
| C3 | **Cross-instance IDOR in sync.** Push writes/deletes `frame_documents` for any body `entityId`; the authenticated instance ID is only used for conflict records. Pull returns **all** frame docs to any bearer token. Instance A overwrites/reads instance B. | `app/api/sync/push/route.ts:49–78`, `app/api/sync/pull/route.ts:30`, `lib/sync/auth.ts:11` |
| C4 | **PG schema lacks sync columns.** `persist()` sets `revision/contentHash/updatedBy`; the PG `frame_documents` table defines none and no drizzle pg migration adds them. Console-mode saves crash or silently drop revision → conflict detection dead in PG. SQLite-only tests hide it. | `lib/store.ts:284`, `lib/db/schema.pg.ts:3–15`, `drizzle/0000_pale_mercury.sql` |
| C5 | **`POST /api/sync/run` unauthenticated + SSRF.** Attacker-supplied `endpoint`+`token` makes the kiosk push its queued payloads to the attacker's server (exfil) and pull/apply attacker content onto the display (injection). | `app/api/sync/run/route.ts:16–24` |

## 2. High defects

| # | Finding | Evidence |
|---|---------|----------|
| H1 | **Conflict detection broken; retries silently drop changes.** Client never sends `baseRevision` (queue rows don't carry it) and the payload (`FrameStore`) carries no `revision` field. Push condition `remoteRev > 0 && remoteRev !== payload?.revision` records a **false conflict on every push after the first**; the conflict branch then stores the idempotency key, so the retry is answered "accepted", `markDone` deletes the queue row — the local edit is never applied. Violates spec §8.4 "at-least-once delivery; conflicts surfaced, not silently resolved". | `lib/sync/client.ts:23–29`, `app/api/sync/push/route.ts:53,66`, `lib/sync/queue.ts:9–21` |
| H2 | **Pull echo loop.** `pullRemote` applies remote docs via `mutateStore`, which re-enqueues an upsert with a fresh idempotency key → pulled changes are pushed back, console bumps revisions again → perpetual write churn/revision ping-pong. | `lib/sync/client.ts:63–67`, `lib/store.ts:296–299` |
| H3 | **Service worker bricks content updates.** Pure cache-first for *every* GET including `/api/store` and `/api/active`, cached forever under static `frame-v1`; a display serves stale JSON permanently, editor saves never appear. No versioned invalidation. | `public/sw.js:2–13` |
| H4 | **Unauthenticated asset upload with stored XSS.** No auth; mime taken verbatim from attacker's `data:` prefix; `GET /api/assets/[id]` serves it with that `Content-Type` (`text/html`, `image/svg+xml` → same-origin script execution). 10 MB each, unlimited → disk DoS. | `app/api/assets/route.ts:21–51`, `app/api/assets/[id]/route.ts` |
| H5 | **Queue not crash-durable.** `markInflight` items stranded after crash/timeout are never reclaimed (`getPending` selects only `pending`). No dead-letter/max-attempts; `markDone` deletes rows so audit trail of delivered changes is gone. Violates spec §8.1 "survives restarts". | `lib/sync/queue.ts:29–35,46` |

## 3. Medium defects

- **M1** `store.ts:300` swallows `enqueueChange` failures after commit → silent divergence from console. Log at minimum.
- **M2** `sync_checkpoints` exists in both schemas but is read/written by **zero code**; `worker.ts:12` discards the returned cursor → every 15-min cycle is a full pull of all docs (spec §8.3 violated).
- **M3** `app/api/sync/ack/route.ts:19` is a no-op that reports `acknowledged` — fake durability signal.
- **M4** `registry.ts:34` uses `sql\`max(0, ref_count + …)\`` — SQLite-only scalar syntax; PG `max` is an aggregate → error. Moot in practice because `adjustRefCount` is never called: `refCount` stays 0 and the DELETE guard is inert behind a full doc scan.
- **M5** Non-constant-time secret comparisons: `lib/sync/auth.ts:16` (`token === SYNC_SECRET`), `lib/admin.ts:6`.
- **M6** Full-table loads then in-memory slice/filter: `queue.ts:29–32`, `audit.ts:22`, `pull/route.ts:30–39`.

## 4. Spec gaps (vs `docs/superpowers/specs/2026-10-19-local-first-multi-frame-platform-design.md`)

- **§8.1/8.3/8.4/5.2** sync guarantees — see H1/H5/M2 above.
- **§9** config push: "instance validates and applies atomically, retains last-known-good on failure" → route does an unvalidated shallow spread-merge (`{...doc.data, ...data}`), no zod, no revision bump. `app/api/instances/[id]/config/route.ts:18–23`
- **§9** registration-token redeem flow missing (token handed out directly).
- **§10** audit actor hardcoded `'admin'` instead of Clerk identity; Clerk roles/ownership authorization unconfigured.
- **§10** timestamp-window replay protection missing.
- **§6** backup is dead code: `createSnapshot`/`rotateBackups` have no callers; no restore CLI/API; no snapshot before migration; corrupt DB throws instead of "restore latest backup and log".
- **§6** migration runner: single `0000_init.sql`, no version tracking/transactions.
- **§4.2** lifecycle states/degraded + shutdown hook never invoked.
- **§12.4/12.5** media→asset backfill and kiosk-conf token migration missing.
- **Roadmap L38** `frame_templates` removal not done; **§5.3** Bob history decoupling silently dropped (not in any stage plan).
- **Stage-2 plan Task 14** offline indicator missing; console cards lack health/heartbeat/version/capabilities/sync-status (spec §4.3).
- **§5.2 L122** no console conflict UI (`listConflicts`/`resolveConflict` unused).
- **Stage-3 tests** (round-trip, interrupted, duplicate, conflict; plan Task 6 `conflicts.test.ts`) absent; "e2e sync verified" in the PR body has no committed test.
- **§7.1/7.2** assets stored flat `hash12.ext` (spec: `assets/<type>/<id>.<ext>`); no version rows/soft-delete.
- Enqueue gated on raw `process.env.FRAME_MODE === 'instance'` while `mode.ts` defaults to sqlite when unset → sync silently off in default local mode.

## 5. Standards violations (hard)

- **`any` as the dialect escape hatch** — `getDb() as any` / `getTables() as any` in ~17 files; `catch (e: any)` at 3 sites. Root cause: untyped `getDb()`/`getTables()` union. This is exactly the bug class that let C4 (missing PG columns) pass typecheck. (Parent AGENTS.md: "`unknown` instead of `any`, then narrow".)
- **Service-layer architecture** (repo AGENTS.md Build beat + `code-structure` skill) — routes own the "how": `sync/push/route.ts:39–85` (idempotency/revision/conflict logic inline), `sync/pull/route.ts:28–56` (duplicated in `client.ts:52–70`), `assets/route.ts:20–53` (hashing + file IO), `assets/[id]/route.ts:24–33` (full scan + ref-check), `instances/[id]/config/route.ts:18–23`.
- **Module-load side effects / implicit inputs** — `const { frameDocuments } = getTables() as any` frozen between imports (`store.ts:12`, `api/frames/route.ts:6`, `api/sources/route.ts:7`); `lib/sync/client.ts:11–17` mutable module singletons (`lastSyncAt/lastError/running`); `runSyncCycle` returns `cursor | undefined` (silent no-op when `running`).
- **Error handling** — bare swallowing `catch {}` in `assets/[id]/route.ts:35`, `backup/index.ts:28`, `lifecycle/index.ts:21,29,35`, `sync/worker.ts:12`.
- **No inline styles** — `components/landing/hero.tsx:14–18`.

## 6. Judgement-call smells

- **Duplicated Code:** frameMap/enrichment in `instances/route.ts:16–25` ≈ `console/page.tsx:10–12`; `?frame=` parsing copy-pasted across 11 routes; sqlite-vs-pg txn blocks `db/index.ts:77–105`.
- **Repeated Switches:** `entityType === 'frame_document' && operation` cascade in push + pull + client.
- **Primitive Obsession / Data Clumps:** free-string `entityType`/`operation`; `{instanceId, token, endpoint}` rebuilt in routes despite `SyncConfig`.
- **Mysterious Names:** `dh()`, `tables()` (`db/index.ts`), `db2`, `adminOk` returning `true` (name hides fail-open).
- **Speculative Generality:** `rotateBackups`, `resolveConflict` with zero callers (also a §6 spec gap — wire them up instead of deleting).

## 7. Checked and genuinely fine

`safeAssetPath` traversal defense (NUL, resolve+prefix+basename) · `registerAsset` dedup-race retry ·
per-dialect transaction split in `recordDecision` · per-frame serialization in `mutateStore` ·
410→full-pull retry · WAL pragma + checkpoint-shutdown · remote-fetch host allowlist ·
backup keep-newest rotation logic.
