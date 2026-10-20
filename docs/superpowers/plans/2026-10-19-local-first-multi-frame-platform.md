# Local-First Multi-Frame Platform — Master Roadmap

> **For agentic workers:** This is a roadmap, not an executable task list. Each stage has its own detailed plan under `docs/superpowers/plans/`. Execute one stage at a time via `superpowers:subagent-driven-development` or `superpowers:executing-plans`, with adversarial review per task and a documentation update per stage.

**Goal:** Evolve Frame into a local-first, persistent, multi-instance platform with a central management console and robust synchronization.

**Architecture:** One Next.js codebase in two modes (`instance` backed by local SQLite, `console` backed by Postgres). Local instance owns runtime and locally-authoritative data; central console coordinates fleet, sync, policy. Bob engine decisions drive display layout.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.7, Drizzle ORM (sqlite + pg), SQLite (WAL), Clerk, nanoid, Zod, SWR, service worker.

---

## Stage map

| Stage | Name | Depends on | Detailed plan | Status |
|---|---|---|---|---|
| 0 | Audit & baseline | — | (done) | complete |
| 1 | Architecture & design | 0 | `docs/superpowers/specs/2026-10-19-local-first-multi-frame-platform-design.md` | complete |
| 2 | Local-first foundation | 1 | `docs/superpowers/plans/2026-10-19-local-first-foundation.md` | planned |
| 3 | Synchronization engine | 2 | `docs/superpowers/plans/2026-10-19-sync-engine.md` (TBD at Stage 2 close) | not started |
| 4 | Multi-frame console | 2, 3 | `docs/superpowers/plans/2026-10-19-multi-frame-console.md` (TBD) | not started |
| 5 | Migration & rollout | 2, 3, 4 | `docs/superpowers/plans/2026-10-19-migration-rollout.md` (TBD) | not started |
| 6 | Verification & hardening | 2-5 | `docs/superpowers/plans/2026-10-19-verification-hardening.md` (TBD) | not started |

Stage plans are written just-in-time (at the close of the prior stage) so they reflect actual code state. Each stage plan must follow the bite-sized TDD format from `superpowers:writing-plans`.

## Stage 2 — Local-first foundation (detailed plan exists)

Deliverables:
- DB driver abstraction (sqlite/pg) selected by `FRAME_MODE`.
- SQLite schema + migrations + runner.
- Instance lifecycle (init/start/stop/recover) via `instrumentation.ts`.
- Backup/restore + integrity check + rotation.
- Asset registry + storage + API + traversal protection.
- Frame-aware editor (pass `frameId` through store hook/mutations).
- Bob decisions drive display layout (schedule as fallback).
- Offline support: service worker cache + offline indicator.
- Remove dead `frame_templates` table (migration).
- Docs: install/migration notes.

Detailed tasks: see `docs/superpowers/plans/2026-10-19-local-first-foundation.md`.

## Stage 3 — Synchronization engine

Deliverables:
- `sync_queue` table + worker.
- Push/pull/ack protocol endpoints on console.
- Idempotency + checkpoints + incremental sync.
- Conflict detection + conflict records + manual resolution hook.
- Compatibility version check.
- Retry/backoff (reuse `nextRetryDelay`).
- Tests: round-trip, offline queue, interrupted transfer, duplicate, conflict.

## Stage 4 — Multi-frame console

Deliverables:
- `/console` dashboard replacing display-on-`/frame`.
- Instance registration + device tokens + Clerk auth/roles.
- Health/heartbeat + version compatibility.
- Settings viewer/push + config rollout with validation/rollback.
- Audit log.
- Decommission/revoke.

## Stage 5 — Migration & rollout

Deliverables:
- DB driver migration tooling.
- Postgres→SQLite export/import.
- Media→asset registry backfill.
- Kiosk config migration + registration step.
- Backward-compat for hosted console (Postgres path retained).
- Upgrade/rollback procedures.

## Stage 6 — Verification & hardening

Deliverables:
- Resilience test suite (offline, restart, conflict, interrupted sync, storage failure, schema upgrade).
- Security review + audit.
- Performance (sync throughput, DB size).
- Ops docs: install, config, upgrade, backup, restore, troubleshoot.

## Cross-cutting constraints
- TDD for all new logic; adversarial review per task (`review-<range>.diff`).
- Progress ledger: `.superpowers/sdd/2026-10-19-local-first-multi-frame-platform/progress.md`.
- Documentation update per stage (README, kiosk-cli, ops docs).
- No code changes until Stage 2 plan approved and executed.

## Risks
- Two DB dialects; mitigate with shared schema + integration tests on both.
- Clerk external dependency.
- SQLite single-writer; enforce single process.
- Asset sync bandwidth; chunking deferred to Stage 3/4.
- Migration requires user action.

## Open questions (resolve before Stage 2 execution)
- Object storage provider for console media (S3 vs R2).
- Service worker caching scope.
- `content_sources` keep vs remove.
