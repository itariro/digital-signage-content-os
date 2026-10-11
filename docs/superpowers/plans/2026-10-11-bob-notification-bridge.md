# Bob Notification Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Bob experience rule with speech wins a decision, publish that speech as a frame notification so live frames (which run main's SWR + notifications pipeline) display Bob's content — with no new client polling and no `display_history` flooding.

**Architecture:** A new `lib/bob-bridge.ts` exposes `tickBobEngine(frameId)`, called fire-and-forget from `GET /api/store` (which frames already poll every 3s). The tick is throttled (≥60s per frame) and single-flight, runs `getDecision(frameId)`, and on a decision change with `bob.speech` prepends a `FrameNotification` via the existing `mutateStore` serialization queue. Delivery to the frame happens through the existing notification pipeline. Spec: `docs/superpowers/specs/2026-10-11-bob-notification-bridge-design.md`.

**Tech Stack:** Next.js 16 route handler, TypeScript strict, vitest (node environment, `lib/**/__tests__/**/*.test.ts`), existing helpers: `lib/ttl-cache.ts`, `lib/notifications.ts` (`normalizeFrameNotifications`), `nanoid`, `lib/engine/state.ts` (`getDecision`, `log`), `lib/store.ts` (`mutateStore`).

**Key facts an executor needs:**

- `mutateStore(fn, frameId)` (lib/store.ts:267) serializes read-modify-write per frame; `fn` receives the current `FrameStore` and returns the next one.
- `normalizeFrameNotifications(list)` (lib/notifications.ts) clamps `durationMs` to 2500–60000, drops entries without `id`/`title`, caps at 20 — reuse it exactly like `app/api/frames/[frameId]/notifications/route.ts` does.
- `getDecision(frameId)` (lib/engine/state.ts) returns `{ decision, context, store }`; `decision.bob` is `{ expression, speech } | null | undefined`; `decision.ruleId` is `string | null`; fallback decisions have `bob: null`.
- `log(level, message, meta)` in lib/engine/state.ts is currently module-private — Task 1 exports it.
- `createTtlCache<T>(ttlMs, now?)` (lib/ttl-cache.ts) accepts an injectable clock — used for deterministic throttle tests.
- All module imports involved (`lib/store`, `lib/db`, `lib/engine/state`) are side-effect-free at import time (pg Pool is created lazily), so bridge tests inject fake deps directly; **no `vi.mock` needed**.
- `DisplayState` and `FrameNotification` are exported from `lib/types.ts`.
- Run tests from the repo root: `npx vitest run <path>`. Full suite: `npm test`.

---

### Task 1: Export the structured `log` helper from the engine

**Files:**
- Modify: `lib/engine/state.ts` (the `log` function, ~line 22)

- [ ] **Step 1: Export `log`**

In `lib/engine/state.ts`, change:

```ts
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
```

to:

```ts
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
```

- [ ] **Step 2: Run the engine state tests**

Run: `npx vitest run lib/engine/__tests__/state.test.ts`
Expected: PASS (all tests in that file green)

- [ ] **Step 3: Commit**

```bash
git add lib/engine/state.ts
git commit -m "refactor(engine): export structured log helper for reuse"
```

---

### Task 2: `bobVariantFor` — DisplayState → notification variant mapping

**Files:**
- Create: `lib/bob-bridge.ts`
- Test: `lib/__tests__/bob-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/bob-bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bobVariantFor } from '../bob-bridge'

describe('bobVariantFor', () => {
  it('maps celebration to success', () => {
    expect(bobVariantFor('celebration')).toBe('success')
  })

  it('maps reminder to reminder', () => {
    expect(bobVariantFor('reminder')).toBe('reminder')
  })

  it('maps action to warning', () => {
    expect(bobVariantFor('action')).toBe('warning')
  })

  it('maps every other display state to info', () => {
    for (const state of ['ambient', 'information', 'activity', 'gallery', 'weather', 'family'] as const) {
      expect(bobVariantFor(state)).toBe('info')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: FAIL — cannot resolve `../bob-bridge` (module does not exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `lib/bob-bridge.ts`:

```ts
import type { DisplayState, FrameNotification } from './types'

/** Maps the engine's display state onto main's notification variants. */
export function bobVariantFor(state: DisplayState): FrameNotification['variant'] {
  switch (state) {
    case 'celebration':
      return 'success'
    case 'reminder':
      return 'reminder'
    case 'action':
      return 'warning'
    default:
      return 'info'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/bob-bridge.ts lib/__tests__/bob-bridge.test.ts
git commit -m "feat(bob-bridge): map display states to notification variants"
```

---

### Task 3: `createBobBridge` — throttled, single-flight tick that publishes on decision change

**Files:**
- Modify: `lib/bob-bridge.ts`
- Test: `lib/__tests__/bob-bridge.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/bob-bridge.test.ts` (keep the existing `bobVariantFor` block; update the import line at the top to):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bobVariantFor, createBobBridge, DEFAULT_BOB_THROTTLE_MS } from '../bob-bridge'
import type { DisplayDecision, ExperienceContext, FrameStore } from '../types'
```

Then append these helpers and tests after the `bobVariantFor` describe block:

```ts
function makeDecision(overrides?: Partial<DisplayDecision>): DisplayDecision {
  return {
    id: 'dec-1',
    state: 'celebration',
    layoutId: 'layout-1',
    bob: { expression: 'celebrate', speech: 'Well done!' },
    priority: 10,
    score: 5,
    reason: 'Chores complete',
    ruleId: 'r1',
    durationMs: 30_000,
    generatedAt: '2026-10-11T08:00:00.000Z',
    ...overrides,
  }
}

function makeContext(): ExperienceContext {
  return {
    now: '2026-10-11T08:00:00.000Z',
    date: { iso: '2026-10-11', day: 'Sat', dayNumber: 11, month: 'Oct', year: 2026 },
    weekday: 'SAT',
    period: 'morning',
    schoolDay: false,
    specialTags: [],
  }
}

function makeStore(): FrameStore {
  return {
    activeId: 'layout-1',
    layouts: [],
    presets: [],
    customFonts: [],
    schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
    albums: [],
    experiences: {
      enabled: true,
      rules: [{
        id: 'r1',
        name: 'Chores',
        enabled: true,
        priority: 10,
        when: { days: ['SAT'] },
        then: { layoutId: 'layout-1', state: 'celebration', bob: { expression: 'celebrate', speech: 'Well done!' }, score: 5, durationMs: 30_000 },
      }],
      settings: { schoolHolidays: [] },
    },
    notifications: [],
  }
}

/** Fake deps with an injectable clock and a mutateStore that actually applies the mutator. */
function makeBridge(opts?: { throttleMs?: number }) {
  let clock = Date.parse('2026-10-11T08:00:00Z')
  let store = makeStore()
  const getDecision = vi.fn(async (_frameId: string) => ({ decision: makeDecision(), context: makeContext(), store }))
  const mutateStore = vi.fn(async (fn: (s: FrameStore) => FrameStore | void, _frameId: string) => {
    store = fn(store) as FrameStore
    return store
  })
  const bridge = createBobBridge({
    getDecision,
    mutateStore,
    now: () => clock,
    throttleMs: opts?.throttleMs,
  })
  return {
    bridge,
    getDecision,
    mutateStore,
    advance: (ms: number) => { clock += ms },
    notifications: () => store.notifications ?? [],
    setDecision: (decision: DisplayDecision) => {
      getDecision.mockImplementation(async () => ({ decision, context: makeContext(), store }))
    },
  }
}

describe('createBobBridge.tick', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Keep error-path tests quiet; the bridge logs structured JSON on failures.
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('publishes a notification built from the winning decision', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(1)
    const [note] = b.notifications()
    expect(note.title).toBe('Chores')                 // rule name, not decision.reason
    expect(note.message).toBe('Well done!')
    expect(note.variant).toBe('success')               // celebration → success
    expect(note.eventKey).toBe('bob:r1')
    expect(note.durationMs).toBe(30_000)               // normalize clamps to ≤60s; 30s passes through
    expect(note.createdAt).toBe('2026-10-11T08:00:00.000Z')
    expect(note.id.length).toBeGreaterThan(0)
  })

  it('does not re-publish while the same decision persists', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
    expect(b.mutateStore).toHaveBeenCalledTimes(1)
    expect(b.notifications()).toHaveLength(1)
  })

  it('publishes again when the decision id changes, newest first', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.setDecision(makeDecision({ id: 'dec-2', bob: { expression: 'talking', speech: 'Rain later' }, state: 'weather', reason: 'Weather watch' }))
    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    const notes = b.notifications()
    expect(notes).toHaveLength(2)
    expect(notes[0].message).toBe('Rain later')
    expect(notes[0].variant).toBe('info')
    expect(notes[0].eventKey).toBe('bob:r1')
    expect(notes[1].message).toBe('Well done!')
  })

  it('falls back to decision.reason as title when the rule is unknown', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ ruleId: 'ghost' }))
    await b.bridge.tick('home')

    expect(b.notifications()[0].title).toBe('Chores complete')
    expect(b.notifications()[0].eventKey).toBe('bob:ghost')
  })

  it('publishes nothing when the decision has no bob', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ bob: null }))
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(1)
    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('publishes nothing when speech is blank', async () => {
    const b = makeBridge()
    b.setDecision(makeDecision({ bob: { expression: 'thinking', speech: '   ' } }))
    await b.bridge.tick('home')

    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('throttles: skips evaluation within the throttle window', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.advance(DEFAULT_BOB_THROTTLE_MS - 1)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(1)
  })

  it('single-flight: overlapping ticks evaluate once', async () => {
    let release!: (value: { decision: DisplayDecision; context: ExperienceContext; store: FrameStore }) => void
    const pending = new Promise<{ decision: DisplayDecision; context: ExperienceContext; store: FrameStore }>((resolve) => { release = resolve })
    const getDecision = vi.fn((_frameId: string) => pending)
    let store = makeStore()
    const mutateStore = vi.fn(async (fn: (s: FrameStore) => FrameStore | void, _frameId: string) => {
      store = fn(store) as FrameStore
      return store
    })
    const bridge = createBobBridge({ getDecision, mutateStore })

    const first = bridge.tick('home')
    const second = bridge.tick('home')
    release({ decision: makeDecision(), context: makeContext(), store })
    await Promise.all([first, second])

    expect(getDecision).toHaveBeenCalledTimes(1)
    expect(mutateStore).toHaveBeenCalledTimes(1)
  })

  it('tracks frames independently', async () => {
    const b = makeBridge()
    await b.bridge.tick('kitchen')
    await b.bridge.tick('hallway')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
    expect(b.getDecision).toHaveBeenCalledWith('kitchen')
    expect(b.getDecision).toHaveBeenCalledWith('hallway')
    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    // Second arg of mutateStore is the frameId
    expect(b.mutateStore.mock.calls[0][1]).toBe('kitchen')
    expect(b.mutateStore.mock.calls[1][1]).toBe('hallway')
  })

  it('swallows getDecision failures and never rejects', async () => {
    const b = makeBridge()
    b.getDecision.mockRejectedValueOnce(new Error('db down'))

    await expect(b.bridge.tick('home')).resolves.toBeUndefined()
    expect(b.mutateStore).not.toHaveBeenCalled()
  })

  it('retries publishing on the next tick after a mutateStore failure', async () => {
    const b = makeBridge()
    b.mutateStore.mockRejectedValueOnce(new Error('write failed'))

    await expect(b.bridge.tick('home')).resolves.toBeUndefined()
    expect(b.notifications()).toHaveLength(0)

    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    expect(b.notifications()).toHaveLength(1)
  })

  it('honours a custom throttleMs', async () => {
    const b = makeBridge({ throttleMs: 1_000 })
    await b.bridge.tick('home')
    b.advance(1_001)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: FAIL — `createBobBridge` and `DEFAULT_BOB_THROTTLE_MS` are not exported from `../bob-bridge`

- [ ] **Step 3: Implement `createBobBridge` and the default singleton**

Replace `lib/bob-bridge.ts` with the complete module:

```ts
import { nanoid } from 'nanoid'
import type { DisplayDecision, DisplayState, FrameNotification, FrameStore } from './types'
import { normalizeFrameNotifications } from './notifications'
import { createTtlCache } from './ttl-cache'
import { getDecision, log } from './engine/state'
import { mutateStore } from './store'

export const BOB_NOTIFICATION_EVENT_PREFIX = 'bob:'
export const DEFAULT_BOB_THROTTLE_MS = 60_000

/** Maps the engine's display state onto main's notification variants. */
export function bobVariantFor(state: DisplayState): FrameNotification['variant'] {
  switch (state) {
    case 'celebration':
      return 'success'
    case 'reminder':
      return 'reminder'
    case 'action':
      return 'warning'
    default:
      return 'info'
  }
}

export interface BobBridgeDeps {
  getDecision: (frameId: string) => Promise<{ decision: DisplayDecision; store: FrameStore }>
  mutateStore: (fn: (store: FrameStore) => FrameStore | void, frameId: string) => Promise<FrameStore>
  now?: () => number
  throttleMs?: number
}

/**
 * Drives the Bob engine for live frames. Frames poll /api/store every ~3s; the
 * route calls tick(frameId) without awaiting. The tick is throttled and
 * single-flight per frame so display_history is written at roughly the cadence
 * the engine was designed for, and publishes bob.speech as a frame
 * notification once per decision change (deduped client-side by eventKey).
 */
export function createBobBridge(deps: BobBridgeDeps) {
  const now = deps.now ?? (() => Date.now())
  const throttle = createTtlCache<boolean>(deps.throttleMs ?? DEFAULT_BOB_THROTTLE_MS, now)
  const inFlight = new Set<string>()
  const lastPublishedDecisionId = new Map<string, string>()

  async function tick(frameId: string): Promise<void> {
    if (inFlight.has(frameId)) return
    if (throttle.get(frameId)) return
    inFlight.add(frameId)
    throttle.set(frameId, true)
    try {
      const { decision, store } = await deps.getDecision(frameId)
      const speech = decision.bob?.speech?.trim()
      if (!speech) return
      if (lastPublishedDecisionId.get(frameId) === decision.id) return

      const ruleName = store.experiences.rules.find((r) => r.id === decision.ruleId)?.name
      const notification: FrameNotification = {
        id: nanoid(12),
        title: ruleName ?? decision.reason,
        message: speech,
        variant: bobVariantFor(decision.state),
        durationMs: decision.durationMs,
        createdAt: new Date(now()).toISOString(),
        eventKey: `${BOB_NOTIFICATION_EVENT_PREFIX}${decision.ruleId}`,
      }
      await deps.mutateStore(
        (current) => ({
          ...current,
          notifications: normalizeFrameNotifications([notification, ...(current.notifications ?? [])]).slice(0, 20),
        }),
        frameId,
      )
      // Only remember success: a failed publish is retried on the next tick.
      lastPublishedDecisionId.set(frameId, decision.id)
    } catch (error) {
      log('error', 'Bob bridge tick failed', { frameId, error: String(error) })
    } finally {
      inFlight.delete(frameId)
    }
  }

  return { tick }
}

const defaultBridge = createBobBridge({
  // The real getDecision also returns context; the bridge only needs decision + store.
  getDecision: (frameId) => getDecision(frameId),
  mutateStore,
})

/** Fire-and-forget engine tick for a frame; the returned promise never rejects. */
export function tickBobEngine(frameId: string): Promise<void> {
  return defaultBridge.tick(frameId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: PASS (4 variant tests + 12 tick tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass (94 pre-existing + 16 new), tsc produces no output

- [ ] **Step 6: Commit**

```bash
git add lib/bob-bridge.ts lib/__tests__/bob-bridge.test.ts
git commit -m "feat(bob-bridge): throttled single-flight tick publishing decisions as frame notifications"
```

---

### Task 4: Wire the bridge into `GET /api/store`

**Files:**
- Modify: `app/api/store/route.ts`

- [ ] **Step 1: Call `tickBobEngine` without awaiting**

Replace the contents of `app/api/store/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { tickBobEngine } from '@/lib/bob-bridge'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const frameId = new URL(request.url).searchParams.get('frame') ?? 'home'
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  }
  const store = await readStore(frameId)
  if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
  // Drive the Bob engine in the background; it publishes winning speech as a
  // frame notification which this frame picks up on its next poll. Never
  // awaited: the tick cannot delay or fail the store response.
  void tickBobEngine(frameId)
  return NextResponse.json(store, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds; route list includes `/api/store` and all Bob routes

- [ ] **Step 4: Commit**

```bash
git add app/api/store/route.ts
git commit -m "feat(store-api): drive Bob engine from frame store polling"
```

---

### Task 5: Final verification, cleanup, and integration into main

**Files:**
- Modify: `.gitignore` (append one line)
- Delete: `MERGE_PLAN.md` (scratch file from the merge; superseded by the spec and this plan)

- [ ] **Step 1: Full verification**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: 110 tests pass (94 + 16), tsc clean, build succeeds

- [ ] **Step 2: Housekeeping**

```bash
echo "*.tsbuildinfo" >> .gitignore
rm MERGE_PLAN.md
git stash drop   # the stashed next-env.d.ts regeneration (generated file, no real work)
```

- [ ] **Step 3: Commit housekeeping**

```bash
git add .gitignore
git commit -m "chore: ignore tsbuildinfo artifacts"
```

- [ ] **Step 4: Merge into main (fast-forward) and push both branches**

```bash
git checkout main
git merge --ff-only feature/bob-engine
git push origin main
git push origin feature/bob-engine
git checkout feature/bob-engine
```

Expected: `main` and `feature/bob-engine` both point at the same commit; both pushes succeed.

- [ ] **Step 5: Sanity-check the live path (optional, manual)**

```bash
npm run dev
```

Open `http://localhost:3000/frame` in one tab and `http://localhost:3000` (editor) in another. With experiences enabled and a matching rule that has speech, the frame should show the Bob notification card within ~60–90s (first tick throttled evaluation + 3s store poll), and `display_history` should gain roughly one row per minute — not per 3s poll.
