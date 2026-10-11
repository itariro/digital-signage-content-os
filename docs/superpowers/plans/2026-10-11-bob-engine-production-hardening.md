# Bob Engine Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Bob engine + notification bridge from inert-and-fragile into production-ready: schema hardening, a speech authoring surface with seeded speech, store notification hygiene, weather timeout, deterministic notification-mode selection, render-priority correctness, observability, and truthful previews.

**Architecture:** The engine stays pure; policy branches (notification vs layout selection) are explicit options. The bridge dedupes by `eventKey` in the store instead of stacking rows. The notice layer's merge/sort becomes a pure, tested function. Preview reads an optional client draft and frame-local timezone.

**Tech Stack:** Next.js 16 route handlers, TypeScript strict, zod schemas, vitest (node), SWR, drizzle/pg.

**Source review:** adversarial review findings delivered 2026-10-11; this plan fixes the Critical + High + Medium items in the approved order. Deferred (not in this plan): Low findings — editor tick on load without `frame` param, invalid-tz fallback unification, DST tests, failed-save draft revert, dead decision path documentation, multi-instance dedupe.

**Key facts for the executor:**
- Tests: `npx vitest run <path>` single file; `npm test` full suite (94→122 today); `npx tsc --noEmit`; `npm run build`. `next build` regenerates `next-env.d.ts` — `git checkout -- next-env.d.ts` after builds.
- `lib/notifications.ts` holds all notification pure helpers; `lib/bob-bridge.ts` holds the bridge with injected deps (`createBobBridge`) — tests never `vi.mock`, they pass fakes.
- `getDecision(frameId, now?, options?)` in `lib/engine/state.ts`; `GetDecisionOptions` currently has `simulatedTime`, `simulatedWallTime`, `recordHistory`.
- `scoreCandidates(candidates, history, currentLayoutId, nowMs?)` in `lib/engine/scoring.ts`; `selectWinner(candidates, options?)` in `lib/engine/selector.ts`.
- Repo convention: tests live in `lib/**/__tests__/`; there are NO route-handler tests — routes are verified via tsc + build.
- Work happens on `feature/bob-engine`; integration to `main` + push happens once at the end (user-approved flow).

---

### Task 1: Harden `experiencesSchema`

**Files:**
- Modify: `lib/schema.ts`
- Test: `lib/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `lib/__tests__/schema.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { experiencesSchema } from '../schema'

const base = {
  enabled: true,
  settings: { schoolHolidays: [] },
}

function rule(id: string, when: unknown, then?: Record<string, unknown>) {
  return { id, name: id, enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0, ...then } }
}

function nest(depth: number): unknown {
  let node: unknown = { specialTag: 'rain' }
  for (let i = 0; i < depth; i++) node = { all: [node] }
  return node
}

describe('experiencesSchema', () => {
  it('accepts a valid rule', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] })] }).success).toBe(true)
  })

  it('rejects duplicate rule ids', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('dup', { days: ['MON'] }), rule('dup', { days: ['TUE'] })] })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid time format', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('r1', { time: { from: '25:99', to: '08:00' } })] })
    expect(result.success).toBe(false)
  })

  it('accepts a valid time format', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { time: { from: '06:00', to: '08:45' } })] }).success).toBe(true)
  })

  it('rejects a duration above 24 hours', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { durationMs: 1_000_000_000 })] })
    expect(result.success).toBe(false)
  })

  it('accepts a duration of exactly 24 hours', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { durationMs: 86_400_000 })] }).success).toBe(true)
  })

  it('rejects an out-of-range score', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: 1_000_000_000 })] }).success).toBe(false)
  })

  it('accepts scores at the bounds', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: 1000 })] }).success).toBe(true)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: -1000 })] }).success).toBe(true)
  })

  it('rejects an unknown specialTag and accepts a known one', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { specialTag: 'snow' })] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { specialTag: 'rain' })] }).success).toBe(true)
  })

  it('rejects condition trees deeper than 10 levels', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', nest(11))] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', nest(10))] }).success).toBe(true)
  })

  it('rejects condition lists longer than 20 entries', () => {
    const long = { all: Array.from({ length: 21 }, () => ({ specialTag: 'rain' })) }
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', long)] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { all: Array.from({ length: 20 }, () => ({ specialTag: 'rain' })) })] }).success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/schema.test.ts`
Expected: FAIL on the new cases (duration/score/tag/depth/length unconstrained today); the original 5 pass.

- [ ] **Step 3: Implement the clamps**

In `lib/schema.ts`:

1. Above `conditionSchema`, add:

```ts
const MAX_CONDITION_DEPTH = 10
const MAX_CONDITION_LIST = 20
const MAX_DURATION_MS = 86_400_000
```

2. Replace `z.object({ specialTag: z.string() })` inside `conditionSchema` with:

```ts
    z.object({ specialTag: z.enum(['rain', 'heat', 'cold', 'uv']) }),
```

3. In `experienceRuleSchema.then`, replace the two fields:

```ts
    score: z.number().min(-1000).max(1000),
    durationMs: z.number().int().min(0).max(MAX_DURATION_MS),
```

4. In `experiencesSchema.superRefine`, after the duplicate-id loop, add per-rule shape checks:

```ts
      const issue = conditionShapeIssue(rule.when, 1, `rules[${index}].when`)
      if (issue) ctx.addIssue({ code: 'custom', message: issue, path: [index, 'when'] })
```

And add the helper directly above `experiencesSchema`:

```ts
/** Depth/size guard: recursive shapes are cheap to state in zod but expensive to accept unbounded. */
function conditionShapeIssue(condition: unknown, depth: number, path: string): string | null {
  if (depth > MAX_CONDITION_DEPTH) return `Condition at ${path} nests deeper than ${MAX_CONDITION_DEPTH} levels`
  if (!condition || typeof condition !== 'object') return null
  for (const key of ['all', 'any'] as const) {
    const value = (condition as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      if (value.length > MAX_CONDITION_LIST) return `Condition list "${key}" at ${path} exceeds ${MAX_CONDITION_LIST} entries`
      for (let i = 0; i < value.length; i++) {
        const issue = conditionShapeIssue(value[i], depth + 1, `${path}.${key}[${i}]`)
        if (issue) return issue
      }
    }
  }
  const not = (condition as Record<string, unknown>).not
  return not === undefined ? null : conditionShapeIssue(not, depth + 1, `${path}.not`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/schema.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Full suite + typecheck, commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add lib/schema.ts lib/__tests__/schema.test.ts
git commit -m "fix(schema): clamp rule scores, durations, special tags, and condition shape"
```

---

### Task 2: Speech authoring surface + seeded speech

**Files:**
- Modify: `lib/store.ts` (seed rules gain speech)
- Modify: `components/editor/experiences-panel.tsx` (expression + speech inputs)
- Test: `lib/__tests__/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/seed.test.ts` (inside `describe('seed', ...)`, after the last test):

```ts
  it('authors speech on several default rules so the bridge can speak out of the box', () => {
    const withSpeech = seed().experiences.rules.filter((r) => r.then.bob?.speech?.trim())
    expect(withSpeech.length).toBeGreaterThanOrEqual(3)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/seed.test.ts`
Expected: FAIL — currently 0 default rules have speech.

- [ ] **Step 3: Add speech to the seeded rules**

In `lib/store.ts`, edit the four `bob` props inside `defaultExperienceRules` (lines 140-146) as follows:

```ts
    { id: nanoid(8), name: 'Morning', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '06:00', to: '08:45' } }] }, then: { layoutId: id('Morning'), state: 'action', bob: { expression: 'planning', speech: 'Good morning! Have a great day.' }, score: 0, durationMs: 0, reason: 'Morning' } },
```

```ts
    { id: nanoid(8), name: 'Welcome home', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '16:30', to: '18:30' } }] }, then: { layoutId: id('Welcome Home'), state: 'action', bob: { expression: 'happy', speech: 'Welcome home!' }, score: 0, durationMs: 0, reason: 'Welcome home' } },
```

```ts
    { id: nanoid(8), name: 'Weekend', enabled: true, priority: 100, when: { days: ['SAT', 'SUN'] }, then: { layoutId: id('Weekend'), state: 'ambient', bob: { expression: 'celebrate', speech: 'It is the weekend — enjoy it!' }, score: 0, durationMs: 0, reason: 'Weekend' } },
```

```ts
    { id: nanoid(8), name: 'Rain', enabled: true, priority: 200, when: { weather: { rainProbabilityAbove: 60 } }, then: { layoutId: id('Weather'), state: 'weather', bob: { expression: 'reminder', speech: 'Rain is on the way — take an umbrella.' }, score: 0, durationMs: 0, reason: 'Rain' } },
```

Leave the Gallery and Night rules without speech (they have no `bob` today).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/seed.test.ts`
Expected: PASS

- [ ] **Step 5: Add expression + speech inputs to the rule editor**

In `components/editor/experiences-panel.tsx`:

1. Add `BobExpression` to the type import from `@/lib/types` and add after the `STATE_OPTIONS` constant:

```tsx
const EXPRESSION_OPTIONS = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))
```

2. Insert immediately after the closing `</div>` of the layout/state grid (the `grid grid-cols-2 gap-2` block ending at the `</div>` before the priority/score/duration grid):

```tsx
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bob expression</span>
                    <select
                      value={rule.then.bob?.expression ?? ''}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          then: {
                            ...rule.then,
                            bob: e.target.value
                              ? { ...rule.then.bob, expression: e.target.value as BobExpression }
                              : undefined,
                          },
                        })
                      }
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      <option value="">No Bob</option>
                      {EXPRESSION_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bob speech</span>
                    <input
                      type="text"
                      maxLength={500}
                      value={rule.then.bob?.speech ?? ''}
                      placeholder="What Bob says on the frame"
                      onChange={(e) => {
                        const speech = e.target.value
                        const bob = speech || rule.then.bob?.expression
                          ? { expression: rule.then.bob?.expression ?? ('talking' as BobExpression), speech: speech || undefined }
                          : undefined
                        updateRule(rule.id, { then: { ...rule.then, bob } }, true)
                      }}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                  </label>
                </div>
```

(The engine only publishes speech when an expression exists, so typing speech first defaults the expression to `talking`; selecting "No Bob" clears both.)

- [ ] **Step 6: Full suite + typecheck, commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add lib/store.ts lib/__tests__/seed.test.ts components/editor/experiences-panel.tsx
git commit -m "feat(editor): author bob expression and speech in the rule editor, seed spoken rules"
```

### Task 3: Store hygiene — eventKey dedupe in the bridge, expiry pruning in normalize

**Files:**
- Modify: `lib/bob-bridge.ts`
- Modify: `lib/notifications.ts`
- Test: `lib/__tests__/bob-bridge.test.ts`, `lib/__tests__/notifications.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/bob-bridge.test.ts`:

1. Extend `makeBridge` to seed store notifications:

```ts
function makeBridge(opts?: { throttleMs?: number; ruleName?: string; notifications?: FrameNotification[] }) {
  let clock = Date.parse('2026-10-11T08:00:00Z')
  let store = makeStore()
  store.experiences.rules[0].name = opts?.ruleName ?? 'Chores'
  store.notifications = opts?.notifications ?? []
```

(Add `FrameNotification` to the existing type import line from `../types`.)

2. Update the existing republish test (it asserted two same-key entries stacking — that is the defect being fixed):

```ts
  it('replaces the previous card by eventKey instead of stacking duplicates', async () => {
    const b = makeBridge()
    await b.bridge.tick('home')
    b.advance(DEFAULT_BOB_THROTTLE_MS + 1)
    await b.bridge.tick('home')

    expect(b.getDecision).toHaveBeenCalledTimes(2)
    expect(b.mutateStore).toHaveBeenCalledTimes(2)
    // Same eventKey everywhere: the store keeps exactly one Bob entry.
    const notes = b.notifications()
    expect(notes).toHaveLength(1)
    expect(notes[0].eventKey).toBe('bob:r1')
  })
```

3. Add (note: uses a 1s throttle so cycles fit inside the foreign card's 60s window, and run long enough for the Bob card's 30s duration to expire and re-publish — that is the stacking scenario):

```ts
  it('never evicts other notifications while re-publishing Bob cards', async () => {
    const foreign: FrameNotification = {
      id: 'editor-test', title: 'From the editor', variant: 'info', durationMs: 60_000,
      createdAt: new Date(Date.parse('2026-10-11T08:00:00Z')).toISOString(),
    }
    const b = makeBridge({ throttleMs: 1_000, notifications: [foreign] })
    await b.bridge.tick('home')
    // 40s of 1s cycles: the Bob card (30s clamp) expires and re-publishes
    // mid-run; the foreign card (60s) is still live throughout.
    for (let i = 0; i < 40; i++) {
      b.advance(1_001)
      await b.bridge.tick('home')
    }

    const notes = b.notifications()
    expect(notes.filter((n) => n.id === 'editor-test')).toHaveLength(1)
    expect(notes.filter((n) => n.eventKey === 'bob:r1')).toHaveLength(1)
  })
```

In `lib/__tests__/notifications.test.ts` add:

```ts
describe('normalizeFrameNotifications expiry pruning', () => {
  it('drops entries whose display window has passed and keeps fresh ones', () => {
    const now = Date.now()
    const expired = {
      id: 'old', title: 'Old card', variant: 'info', durationMs: 6_000,
      createdAt: new Date(now - 120_000).toISOString(),
    }
    const fresh = {
      id: 'new', title: 'Fresh card', variant: 'info', durationMs: 6_000,
      createdAt: new Date(now - 1_000).toISOString(),
    }
    const normalized = normalizeFrameNotifications([expired, fresh])
    expect(normalized.map((n) => n.id)).toEqual(['new'])
  })
})
```

(Add `normalizeFrameNotifications` to that file's import — it is already imported there from the earlier work in this branch; if not, add it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts lib/__tests__/notifications.test.ts`
Expected: FAIL — the republish test sees 2 entries; the foreign-notification test sees the editor card evicted; expired entries survive normalize.

- [ ] **Step 3: Implement the bridge dedupe**

In `lib/bob-bridge.ts`:

1. Change the import from `./notifications` to include `notificationKey`:

```ts
import { NOTIFICATION_DEFAULT_DURATION, clampNotificationDuration, normalizeFrameNotifications, notificationKey } from './notifications'
```

2. Replace the `mutateStore` call in `tick`:

```ts
      await deps.mutateStore(
        (current) => ({
          ...current,
          notifications: normalizeFrameNotifications([
            notification,
            ...(current.notifications ?? []).filter((n) => notificationKey(n) !== notification.eventKey),
          ]),
        }),
        frameId,
      )
```

- [ ] **Step 4: Implement expiry pruning in normalize**

In `lib/notifications.ts`, inside `normalizeFrameNotifications`, after the existing `id`/`title` filter and before `.slice(0, 20)`:

```ts
    .filter((item) => !notificationIsExpired(item))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts lib/__tests__/notifications.test.ts`
Expected: PASS

- [ ] **Step 6: Full suite + typecheck, commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add lib/bob-bridge.ts lib/notifications.ts lib/__tests__/bob-bridge.test.ts lib/__tests__/notifications.test.ts
git commit -m "fix(bridge): replace same-eventKey cards, prune expired notifications from the store"
```

---

### Task 4: Weather fetch timeout

**Files:**
- Modify: `lib/weather.ts`
- Create: `lib/__tests__/weather.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/weather.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWeather } from '../weather'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchWeather', () => {
  it('passes an abort signal so a hung upstream cannot stall the engine', async () => {
    let seenSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      seenSignal = init?.signal ?? undefined
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })

    await fetchWeather(47.3769, 8.5417, 'metric')

    expect(seenSignal).toBeInstanceOf(AbortSignal)
  })

  it('falls back to sample weather when the request aborts', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }),
    )

    const promise = fetchWeather(47.3769, 8.5417, 'metric')
    // AbortSignal is an EventTarget: firing 'abort' through the captured signal
    // exercises the catch path deterministically without waiting 5 real seconds.
    abortSpy?.dispatchEvent(new Event('abort'))
    const data = await promise

    expect(data.sample).toBe(true)
  })
})
```

Note for the executor: the second test needs the captured signal. Write it with a captured variable instead of `abortSpy`:

```ts
  it('falls back to sample weather when the request aborts', async () => {
    let seenSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      seenSignal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    })

    const promise = fetchWeather(47.3769, 8.5417, 'metric')
    seenSignal?.dispatchEvent(new Event('abort'))
    const data = await promise

    expect(data.sample).toBe(true)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/weather.test.ts`
Expected: FAIL — first test: `seenSignal` is `undefined` (no signal passed today).

- [ ] **Step 3: Implement the timeout**

In `lib/weather.ts`, change the fetch call:

```ts
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(5_000) })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/weather.test.ts`
Expected: PASS (2 tests; the abort path resolves to sample weather, not a hang)

- [ ] **Step 5: Full suite + typecheck, commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add lib/weather.ts lib/__tests__/weather.test.ts
git commit -m "fix(weather): abort hung upstream requests so the engine cannot stall"
```

### Task 5: Notification-mode selection (stop publishing layout-history fiction)

**Files:**
- Modify: `lib/engine/state.ts`
- Modify: `lib/engine/scoring.ts`
- Modify: `lib/bob-bridge.ts`
- Test: `lib/engine/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/engine/__tests__/state.test.ts` (uses that file's existing `makeStore` helper and `mockReadStore`/`mockFetchWeather`/`mockQueryHistory` hoisted mocks — reuse them):

```ts
  it('notification mode ignores display-history scoring so the most relevant rule still speaks', async () => {
    const weatherRule = {
      id: 'r-rain',
      name: 'Rain',
      enabled: true,
      priority: 200,
      when: { weather: { rainProbabilityAbove: 60 } },
      then: { layoutId: 'layout-1', state: 'weather' as const, bob: { expression: 'reminder' as const, speech: 'Take an umbrella.' }, score: 0, durationMs: 0, reason: 'Rain' },
    }
    const dayRule = {
      id: 'r-day',
      name: 'Day',
      enabled: true,
      priority: 100,
      when: { time: { from: '00:00', to: '23:59' } },
      then: { layoutId: 'layout-1', state: 'information' as const, bob: { expression: 'talking' as const, speech: 'Nice day.' }, score: 0, durationMs: 0, reason: 'Day' },
    }
    const store = makeStore({
      experiences: { enabled: true, rules: [weatherRule, dayRule], settings: { schoolHolidays: [] } },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue({
      sample: false,
      current: { temp: 12, code: 61, isDay: true, uv: 2 },
      today: { high: 14, low: 9, uvMax: 3, sunrise: '2026-10-11T06:48', sunset: '2026-10-11T19:12' },
      daily: [{ date: '2026-10-11', code: 61, max: 14, min: 9, rainProbability: 80 }],
      hourly: [],
    })
    // The rain rule's layout was shown one minute ago: layout-mode scoring
    // subtracts the 300-point recent-repetition penalty and hands the win to
    // the mundane day rule.
    mockQueryHistory.mockResolvedValue({
      recent: [{ layoutId: 'layout-1', ruleId: 'r-rain', shownAt: new Date(Date.now() - 60_000) }],
      seenLayouts: new Set<string>(['layout-1']),
      latestLayoutId: 'layout-1',
    })

    const layoutMode = await getDecision('home', new Date(), { recordHistory: false })
    expect(layoutMode.decision.ruleId).toBe('r-day')

    const notificationMode = await getDecision('home', new Date(), { recordHistory: false, selection: 'notification' })
    expect(notificationMode.decision.ruleId).toBe('r-rain')
    expect(notificationMode.decision.bob?.speech).toBe('Take an umbrella.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/engine/__tests__/state.test.ts`
Expected: FAIL — `selection` option does not exist; both calls behave identically (likely both return `r-day`).

- [ ] **Step 3: Implement the mode**

In `lib/engine/scoring.ts`:

1. Add above `scoreCandidates`:

```ts
export type SelectionMode = 'layout' | 'notification'
```

2. Change the signature and body of `scoreCandidates`:

```ts
export function scoreCandidates(
  candidates: EvaluatedRule[],
  history: HistorySummary,
  currentLayoutId: string,
  nowMs: number = Date.now(),
  mode: SelectionMode = 'layout',
): ScoredCandidate[] {
  return candidates
    .filter(({ rule }) => isEligibleByDuration(rule, history.recent, nowMs))
    .map(({ rule, weatherMatched }) => {
      // Notification mode publishes speech only. Novelty and repetition penalties
      // measure layout *displays* — which no longer happen (live layouts are
      // schedule-driven) — so applying them would suppress the most relevant
      // rule's speech. `durationMs` still gates re-matching via eligibility.
      const notificationMode = mode === 'notification'
      const weatherRelevance = weatherMatched ? WEATHER_RELEVANCE : 0
      const novelty = !notificationMode && !history.seenLayouts.has(rule.then.layoutId) ? NOVELTY_BONUS : 0
      const penalty = notificationMode
        ? 0
        : getRepetitionPenalty(history.recent, rule.then.layoutId, currentLayoutId, nowMs)
      const score = rule.priority + rule.then.score + weatherRelevance + novelty - penalty
      return { rule, score, layoutId: rule.then.layoutId }
    })
}
```

In `lib/engine/state.ts`:

1. Extend `GetDecisionOptions`:

```ts
export interface GetDecisionOptions {
  simulatedTime?: Date
  /** Timezone-less wall time interpreted in the frame's configured zone. */
  simulatedWallTime?: string
  /** When false, skip appending to display_history. Defaults to true. */
  recordHistory?: boolean
  /**
   * 'layout' (default) scores as if the winner drives the display — novelty,
   * repetition penalties, incumbent hysteresis. 'notification' scores speech
   * selection only: priority + rule score + weather relevance, with durationMs
   * as the sole cooldown. Used by the Bob bridge on live frames, where layouts
   * are schedule-driven and nothing displays the decision.
   */
  selection?: 'layout' | 'notification'
}
```

2. Replace the scoring/selection block (currently two lines starting `const scored = scoreCandidates(...)`):

```ts
  const notificationMode = options?.selection === 'notification'
  const scored = scoreCandidates(evaluated, history, incumbent, time.getTime(), options?.selection ?? 'layout')
  const winner = selectWinner(
    scored,
    notificationMode ? {} : { incumbentLayoutId: incumbent, hysteresis: INCUMBENT_HYSTERESIS },
  )
```

In `lib/bob-bridge.ts`, point the default bridge at notification mode:

```ts
const defaultBridge = createBobBridge({
  // The real getDecision also returns context; the bridge only needs decision + store.
  getDecision: (frameId) => getDecision(frameId, undefined, { selection: 'notification' }),
  mutateStore,
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/engine/__tests__/state.test.ts`
Expected: PASS — including the 14 pre-existing tests (layout mode unchanged).

- [ ] **Step 5: Full suite + typecheck, commit**

Run: `npm test && npx tsc --noEmit`

```bash
git add lib/engine/state.ts lib/engine/scoring.ts lib/bob-bridge.ts lib/engine/__tests__/state.test.ts
git commit -m "feat(engine): notification-mode selection for speech publishing"
```

---

### Task 6: Render priority — pure merge/sort, keep highest-priority cards (fixes error eviction)

**Files:**
- Modify: `lib/notifications.ts`
- Modify: `components/notifications/notification-provider.tsx`
- Test: `lib/__tests__/notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/notifications.test.ts`:

```ts
import { mergeNotificationList, sortNotificationsForDisplay, notificationKey } from '../notifications'

function card(overrides: Partial<FrameNotification> & { id: string }): FrameNotification {
  return {
    title: overrides.id,
    variant: 'info',
    durationMs: 60_000,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as FrameNotification
}

describe('sortNotificationsForDisplay', () => {
  it('orders errors first, then Bob cards, then the rest, stable within a tier', () => {
    const custom = card({ id: 'c1' })
    const bob = card({ id: 'b1', eventKey: 'bob:r1' })
    const error = card({ id: 'e1', variant: 'error' })
    const custom2 = card({ id: 'c2' })

    expect(sortNotificationsForDisplay([custom, bob, error, custom2]).map((n) => n.id)).toEqual(['e1', 'b1', 'c1', 'c2'])
  })
})

describe('mergeNotificationList', () => {
  it('dedupes by eventKey, drops expired, keeps insertion order within a tier', () => {
    const old = card({ id: 'old', eventKey: 'k' })
    const fresh = card({ id: 'fresh', eventKey: 'k' })
    const error = card({ id: 'err', variant: 'error' })

    const merged = mergeNotificationList([], [old, error, fresh])
    expect(merged.map((n) => n.id)).toEqual(['err', 'fresh'])
  })

  it('keeps the highest-priority 8 — errors are never evicted by volume', () => {
    const error = card({ id: 'err', variant: 'error' })
    const others = Array.from({ length: 20 }, (_, i) => card({ id: `c${i}` }))

    const merged = mergeNotificationList([], [error, ...others])
    expect(merged).toHaveLength(8)
    expect(merged[0].id).toBe('err')
    expect(merged.map((n) => n.id)).toContain('err')
  })
})
```

(`notificationKey` and `FrameNotification` are already available in that file's module graph; add type imports as needed.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/notifications.test.ts`
Expected: FAIL — `mergeNotificationList`/`sortNotificationsForDisplay` do not exist.

- [ ] **Step 3: Implement the pure functions**

In `lib/notifications.ts` add (after `notificationKey`):

```ts
export const BOB_EVENT_KEY_PREFIX = 'bob:'

/** Render priority: errors first, then Bob cards, then everything else. */
function notificationDisplayRank(notification: FrameNotification): number {
  if (notification.variant === 'error') return 0
  if (notificationKey(notification).startsWith(BOB_EVENT_KEY_PREFIX)) return 1
  return 2
}

/**
 * Stable sort for display: error → Bob → other, preserving insertion order
 * within a tier. Pure; never mutates the input.
 */
export function sortNotificationsForDisplay(list: FrameNotification[]): FrameNotification[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => notificationDisplayRank(a.item) - notificationDisplayRank(b.item) || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * The single merge used by every surface: latest-per-eventKey wins, expired
 * entries drop, and the KEEP set is the FIRST `limit` after priority sorting —
 * so high-priority cards are never evicted by volume (the previous
 * slice(-limit) dropped errors whenever more than `limit` cards were live).
 */
export function mergeNotificationList(
  current: FrameNotification[],
  incoming: FrameNotification[],
  limit = 8,
): FrameNotification[] {
  const byKey = new Map(current.map((item) => [notificationKey(item), item]))
  for (const item of incoming) byKey.set(notificationKey(item), item)
  return sortNotificationsForDisplay([...byKey.values()].filter((item) => !notificationIsExpired(item))).slice(0, limit)
}
```

- [ ] **Step 4: Use them in the provider**

In `components/notifications/notification-provider.tsx`:

1. Delete the local `mergeNotifications` function.
2. Import the pure merge: add to the existing import from `@/lib/notifications`:

```ts
  mergeNotificationList,
```

3. Replace both call sites (`useState` initializer and the effect) with:

```ts
  const [notifications, setNotifications] = useState<FrameNotification[]>(() =>
    mergeNotificationList([], normalizeFrameNotifications(sourceNotifications)),
  )
```

```ts
  useEffect(() => {
    const incoming = normalizeFrameNotifications(sourceNotifications)
    setNotifications((current) => mergeNotificationList(current, incoming))
  }, [sourceNotifications])
```

4. In `publish`:

```ts
      publish: (notification) => setNotifications((current) => mergeNotificationList(current, [notification])),
```

Remove the now-unused `notificationKey`/`notificationIsExpired` imports if nothing else references them.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/notifications.test.ts`
Expected: PASS

- [ ] **Step 6: Full suite + typecheck + build, commit**

Run: `npm test && npx tsc --noEmit && npm run build` (then `git checkout -- next-env.d.ts`)

```bash
git add lib/notifications.ts components/notifications/notification-provider.tsx lib/__tests__/notifications.test.ts
git commit -m "fix(notifications): pure merge/sort, Bob cards rank behind errors, errors never evicted by volume"
```

### Task 7: Observability — bridge counters on `/api/health`, log levels to stderr

**Files:**
- Modify: `lib/bob-bridge.ts`
- Modify: `lib/engine/state.ts` (log level mapping)
- Modify: `app/api/health/route.ts`
- Test: `lib/__tests__/bob-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/bob-bridge.test.ts`:

```ts
  it('reports counters and the last tick timestamp for diagnostics', async () => {
    const b = makeBridge()
    const before = b.bridge.stats()
    expect(before.ticks).toBe(0)

    await b.bridge.tick('home')
    b.advance(1)
    await b.bridge.tick('home') // throttled

    const stats = b.bridge.stats()
    expect(stats.ticks).toBe(2)
    expect(stats.throttleSkips).toBe(1)
    expect(stats.evaluations).toBe(1)
    expect(stats.publishes).toBe(1)
    expect(stats.failures).toBe(0)
    expect(typeof stats.lastTickAt).toBe('string')
  })

  it('counts failures per stage for the health endpoint', async () => {
    const b = makeBridge()
    b.getDecision.mockRejectedValueOnce(new Error('db down'))
    await b.bridge.tick('home')

    expect(b.bridge.stats().failures).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: FAIL — `stats` is not on the bridge instance.

- [ ] **Step 3: Implement the counters**

In `lib/bob-bridge.ts`:

1. Inside `createBobBridge`, add:

```ts
  const counters = { ticks: 0, throttleSkips: 0, inflightSkips: 0, evaluations: 0, publishes: 0, failures: 0 }
  let lastTickAt: number | null = null
```

2. In `tick`, increment: `counters.ticks++; lastTickAt = now()` at entry (after the two guard returns — guards first, then count); `counters.throttleSkips++` before `return` in the throttle guard; `counters.inflightSkips++` in the single-flight guard; `counters.evaluations++` after `await deps.getDecision(frameId)`; `counters.publishes++` after the successful mutate; `counters.failures++` in the `catch`.

3. Change the return to:

```ts
  return {
    tick,
    stats: () => ({ ...counters, lastTickAt: lastTickAt === null ? null : new Date(lastTickAt).toISOString() }),
  }
```

4. Export a singleton accessor after `tickBobEngine`:

```ts
/** Diagnostics for /api/health: counters plus the last tick time. */
export function getBobBridgeStats() {
  return defaultBridge.stats()
}
```

- [ ] **Step 4: Map log levels to stderr**

In `lib/engine/state.ts`, replace the `log` body:

```ts
export function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
```

- [ ] **Step 5: Surface Bob health**

In `app/api/health/route.ts`, import and include the stats:

```ts
import { getBobBridgeStats } from '@/lib/bob-bridge'
```

and in the success response:

```ts
    return NextResponse.json({ status: 'ok', database: 'connected', bob: getBobBridgeStats() })
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/bob-bridge.test.ts`
Expected: PASS

- [ ] **Step 7: Full suite + typecheck + build, commit**

Run: `npm test && npx tsc --noEmit && npm run build` (then `git checkout -- next-env.d.ts`)

```bash
git add lib/bob-bridge.ts lib/engine/state.ts app/api/health/route.ts lib/__tests__/bob-bridge.test.ts
git commit -m "feat(bob): expose bridge counters on /api/health, log errors to stderr"
```

---

### Task 8: Truthful previews — frame-local prefill, draft injection, sequence guard

**Files:**
- Modify: `lib/engine/state.ts` (`experiencesOverride` option)
- Modify: `lib/zoned-time.ts` (`formatZonedInputValue`)
- Modify: `app/api/display/preview/route.ts` (POST accepts draft; new GET returns frame-local now)
- Modify: `components/editor/experiences-panel.tsx` (`PreviewSection`)
- Test: `lib/engine/__tests__/state.test.ts`, `lib/__tests__/zoned-time.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/zoned-time.test.ts` append:

```ts
  it('formats an instant as YYYY-MM-DDTHH:mm in the target zone', () => {
    const instant = new Date('2026-10-11T21:30:00Z')
    expect(formatZonedInputValue(instant, 'UTC')).toBe('2026-10-11T21:30')
    expect(formatZonedInputValue(instant, 'Europe/Zurich')).toBe('2026-10-11T23:30')
  })
```

(add `formatZonedInputValue` to that file's imports from `../zoned-time`.)

In `lib/engine/__tests__/state.test.ts` append:

```ts
  it('uses the experiences override when previewing a draft without touching the store', async () => {
    const savedStore = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [] } },
    })
    mockReadStore.mockResolvedValue(savedStore)
    mockFetchWeather.mockResolvedValue(undefined)

    const draft = {
      enabled: true,
      rules: [{
        id: 'draft-1',
        name: 'Draft',
        enabled: true,
        priority: 100,
        when: { days: ['SAT'] },
        then: { layoutId: 'layout-1', state: 'ambient' as const, bob: { expression: 'happy' as const }, score: 0, durationMs: 0 },
      }],
      settings: { schoolHolidays: [] },
    }

    // A Saturday morning: the draft rule matches; the saved store (no rules) would not.
    const saturday = new Date('2026-10-10T09:00:00Z')
    const { decision } = await getDecision('home', saturday, { recordHistory: false, experiencesOverride: draft })

    expect(decision.ruleId).toBe('draft-1')
    expect(savedStore.experiences.rules).toHaveLength(0) // store untouched
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/zoned-time.test.ts lib/engine/__tests__/state.test.ts`
Expected: FAIL — `formatZonedInputValue` missing; `experiencesOverride` missing.

- [ ] **Step 3: Implement the engine override and the formatter**

In `lib/zoned-time.ts` add:

```ts
/** Formats an instant as a `datetime-local` value (YYYY-MM-DDTHH:mm) in `timezone`. */
export function formatZonedInputValue(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const pad = (value: string) => value.padStart(2, '0')
  return `${get('year')}-${pad(get('month'))}-${pad(get('day'))}T${pad(get('hour'))}:${pad(get('minute'))}`
}
```

In `lib/engine/state.ts`:

1. Add to `GetDecisionOptions`:

```ts
  /**
   * Preview-only: evaluate against these experiences instead of the stored
   * ones. Lets the editor preview unsaved drafts. Ignored in layout mode.
   */
  experiencesOverride?: FrameStore['experiences']
```

2. After `const store = await readStore(frameId)` / the not-found check, insert:

```ts
  const experiences = options?.experiencesOverride ?? store.experiences
```

3. Replace every downstream `store.experiences` read with `experiences`:
   - `buildContext(store, ...)` → keep `store` (context reads settings via store; instead pass a shallow-adjusted store below)
   
   Simplest consistent approach — shadow the store right after the check:

```ts
  const store = options?.experiencesOverride
    ? { ...awaitStore, experiences: options.experiencesOverride }
    : awaitStore
```

So rename the original binding to `awaitStore`:

```ts
  const awaitStore = await readStore(frameId)
  if (!awaitStore) throw new FrameNotFoundError(frameId)
  const store = options?.experiencesOverride
    ? { ...awaitStore, experiences: options.experiencesOverride }
    : awaitStore
```

Everything downstream (`buildContext(store, ...)`, `store.experiences.enabled`, rules, the returned `store`) then uses the override transparently.

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `npx vitest run lib/__tests__/zoned-time.test.ts lib/engine/__tests__/state.test.ts`
Expected: PASS

- [ ] **Step 5: Extend the preview route**

Replace `app/api/display/preview/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDecision, FrameNotFoundError } from '@/lib/engine/state'
import { readStore } from '@/lib/store'
import { experiencesSchema } from '@/lib/schema'
import { formatZonedInputValue, resolveTimezone } from '@/lib/zoned-time'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

/** The frame's current wall time, so the editor pre-fills in frame-local time. */
export async function GET(req: NextRequest) {
  const frameId = req.nextUrl.searchParams.get('frame') || 'home'
  if (!FRAME_ID.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }
  try {
    const store = await readStore(frameId)
    if (!store) return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    const timezone = resolveTimezone(store.experiences.settings.timezone)
    return NextResponse.json({ frameLocalNow: formatZonedInputValue(new Date(), timezone) })
  } catch (error) {
    console.error('[display/preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const frameId = req.nextUrl.searchParams.get('frame') || 'home'

  if (!FRAME_ID.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  let body: { dateTime?: string; experiences?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.dateTime || typeof body.dateTime !== 'string') {
    return NextResponse.json({ error: 'dateTime is required' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(body.dateTime)) {
    return NextResponse.json({ error: 'dateTime must be a timezone-less ISO string' }, { status: 400 })
  }

  const draft = body.experiences === undefined
    ? null
    : experiencesSchema.safeParse(body.experiences)
  if (body.experiences !== undefined && !draft?.success) {
    return NextResponse.json({ error: 'Invalid experiences draft' }, { status: 400 })
  }

  try {
    const { decision, context } = await getDecision(frameId, new Date(), {
      simulatedWallTime: body.dateTime,
      recordHistory: false,
      experiencesOverride: draft?.success ? draft.data : undefined,
    })
    return NextResponse.json(
      {
        decision,
        context,
        warning: 'This preview does not account for display history. The real decision may differ.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof FrameNotFoundError) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }
    console.error('[display/preview] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Update PreviewSection**

In `components/editor/experiences-panel.tsx`, rewrite `PreviewSection` to:
- prefill from the frame's clock (GET on mount),

```tsx
function PreviewSection({ frameId = 'home', experiences }: { frameId?: string; experiences: Experiences }) {
  const [dateTime, setDateTime] = useState('')
  const [preview, setPreview] = useState<{ decision?: { layoutId?: string; bob?: { expression?: string } | null; reason?: string }; context?: { period?: string }; warning?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  // Pre-fill with the frame's own clock: the API interprets this as frame-local
  // wall time, so the browser's zone would simulate the wrong instant.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/display/preview?frame=${encodeURIComponent(frameId)}`)
        const data = (await res.json()) as { frameLocalNow?: string }
        if (!cancelled && data.frameLocalNow) setDateTime(data.frameLocalNow)
      } catch {
        // leave empty; the user can still type a time
      }
    })()
    return () => { cancelled = true }
  }, [frameId])

  async function runPreview() {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/display/preview?frame=${encodeURIComponent(frameId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime, experiences }),
      })
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string }
        throw new Error(errData.error ?? `Preview failed (${res.status})`)
      }
      const data = await res.json()
      if (id === requestId.current) setPreview(data) // ignore stale responses
    } catch (error) {
      if (id === requestId.current) {
        console.error('Preview failed:', error)
        setPreview(null)
        setError(error instanceof Error ? error.message : 'Preview failed')
      }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }
```

- keep the existing JSX (label/input/button/error/preview blocks) unchanged;
- pass the draft: `<PreviewSection experiences={experiences} />` where the subcomponent is rendered (the parent `ExperiencesPanel` has `experiences: Experiences` in props — pass its `draft`: `<PreviewSection experiences={draft} />`).

- [ ] **Step 7: Full suite + typecheck + build, commit**

Run: `npm test && npx tsc --noEmit && npm run build` (then `git checkout -- next-env.d.ts`)

```bash
git add lib/engine/state.ts lib/zoned-time.ts app/api/display/preview/route.ts components/editor/experiences-panel.tsx lib/__tests__/zoned-time.test.ts lib/engine/__tests__/state.test.ts
git commit -m "feat(preview): frame-local prefill, draft-aware decisions, stale-response guard"
```

---

## Integration

- [ ] Merge to `main` (fast-forward) and push both branches once all tasks are green:

```bash
npm test && npx tsc --noEmit
git checkout main && git merge --ff-only feature/bob-engine
npm test
git push origin main && git push origin feature/bob-engine
git checkout feature/bob-engine
```



