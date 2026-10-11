# Bob → Frame Notifications Bridge — Design

Date: 2026-10-11
Status: Approved by user (brainstorming session, merge of origin/main into feature/bob-engine)

## Background

`origin/main` added a frame notification system: `FrameNotification` records live in
`store.notifications`, are published via `POST /api/frames/[frameId]/notifications`,
delivered to live frames through `GET /api/store` (SWR, 3s poll), and rendered by
`NotificationProvider` + `FrameNoticeLayer`.

The `feature/bob-engine` branch added the Bob engine: `getDecision(frameId)` evaluates
experience rules against context (time, weather, school days, special tags), scores them
against `display_history`, and returns a `DisplayDecision` with `state`, `layoutId`,
`bob: { expression, speech }`, `reason`, `ruleId`, and `durationMs`.

After the merge (cd36653), live frames run main's pipeline only. Per the architecture
decision made during the merge: **the Bob engine is an add-on and delivers content to live
frames exclusively through main's frame notification system.** Layout selection on live
frames stays 100% schedule-driven; the engine no longer overrides layouts in production.
`/api/display/state` and `/api/display/preview` remain for the editor's simulated-time
preview and diagnostics.

## Goal

When a Bob experience rule with `bob.speech` becomes the winning decision for a frame,
publish that speech as a frame notification so it appears on the live frame via
`FrameNoticeLayer` — with no new client polling, no new infrastructure, and no flooding of
`display_history`.

## Architecture & data flow

New module `lib/bob-bridge.ts` exporting `tickBobEngine(frameId: string): Promise<void>`.
The returned promise never rejects (all errors are caught and logged internally).
`GET /api/store` invokes it **without awaiting** (`void tickBobEngine(frameId)`), so the
store response is never delayed; the tick continues in the background and its result
reaches frames on their next poll.

```
frame polls /api/store?frame=X (every 3s, unchanged)
   → route returns the current store immediately (tick runs in background)
        → per-frame throttle (lib/ttl-cache): skip if last evaluation < 60s ago
        → single-flight: skip if a tick is already running for this frame
        → getDecision(frameId)   (records history as designed; cadence ≥ 60s)
        → if winner has bob.speech AND decision.id ≠ last published decision id:
             mutateStore(frameId): prepend FrameNotification, normalize, cap 20
        → frame receives it on its next 3s poll → FrameNoticeLayer renders it
```

The engine ticks only while a frame is actually polling — exactly when decisions matter.
No cron or background workers are required.

## Notification semantics

Published `FrameNotification` fields:

| Field        | Value                                                              |
|--------------|--------------------------------------------------------------------|
| `id`         | generated (nanoid, same as notifications API)                       |
| `title`      | the matched rule's display name (`rule.name`)                       |
| `message`    | `bob.speech`                                                        |
| `variant`    | mapped from `DisplayState` (table below)                            |
| `durationMs` | `decision.durationMs`, clamped by `normalizeFrameNotifications` (2.5s–60s) |
| `eventKey`   | `bob:<ruleId>`                                                      |
| `createdAt`  | publish time (ISO)                                                  |

Variant mapping (pure function, unit-tested):

| DisplayState                                        | variant   |
|-----------------------------------------------------|-----------|
| `celebration`                                       | `success` |
| `reminder`                                          | `reminder`|
| `action`                                            | `warning` |
| `ambient`, `information`, `activity`, `gallery`, `weather`, `family` | `info` |

Publish rule: **once per decision change.** The bridge remembers the last published
decision id per frame (in-process cache). While the same decision persists across ticks,
nothing is published. Because `eventKey = bob:<ruleId>` and `NotificationProvider` merges
by eventKey, a newer decision on the same rule replaces the previous Bob card instead of
stacking; a server restart can cause at most one re-publish, which is invisible
(same key replaces same content).

When the rule stops matching, the notification is not withdrawn — it expires naturally
after its clamped `durationMs`, matching how all notifications behave in main.

## Concurrency & safety

- `mutateStore` already serializes read-modify-write per frame (queue in `lib/store.ts`),
  so bridge publishes are safe alongside the notifications API and editor saves.
- Throttle (≥60s) + single-flight per frame protect `display_history` from the 3s poll
  cadence: `getDecision` records history at roughly the cadence it was designed for.
- `experiences.enabled === false` → `getDecision` returns the fallback decision
  (`bob: null`) → nothing is published.

## Error handling

- `tickBobEngine` wraps everything; engine, DB, or weather failures are logged with the
  engine's structured `log()` and never affect the `/api/store` response.
- The promise returned by `tickBobEngine` never rejects, so the un-awaited call in
  `/api/store` cannot produce unhandled rejections.

## Out of scope

- Layout switching driven by the engine on live frames (removed by merge decision).
- Bob avatar/expression rendering in notifications — `FrameNoticeLayer` has no image slot;
  notifications carry Bob's words only. The Bob widget on live frames keeps its static
  behaviour (falls back to widget props when no decision is present).
- Withdrawing/expiring notifications early when a rule stops matching.
- Cross-process dedupe state (single-process assumption is acceptable for this signage
  system; worst case is one invisible replace-by-key re-publish per restart).

## Testing

- `lib/__tests__/bob-bridge.test.ts` (vitest):
  - variant mapping table
  - publishes when decision has speech and id changed
  - no re-publish while the same decision persists
  - replace semantics via `eventKey = bob:<ruleId>`
  - disabled experiences → no publish
  - throttle skips evaluation before 60s; single-flight skips overlapping ticks
  - failures in `getDecision`/`mutateStore` are swallowed and logged
  - mocks: `getDecision` (lib/engine/state), `mutateStore` (lib/store); fake timers
- Regression: existing 94 tests green, `tsc --noEmit` clean, `next build` succeeds.
