# Bob Engine Hardening & Display Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the validation, state, and display gaps: enforce rule-ID uniqueness and condition formats, guard unknown themes, bound and freshen the store cache, make seeding race-safe and `normalize` pure, stop leaking internal errors, harden the display poll, render the server's weather, and add the "why am I seeing this" diagnostics.

**Architecture:** Push validation into zod, extract pure utilities (`ttl-cache`, `history-utils`, `themeMeta`) so they are unit-testable, and make `FrameDisplay` a resilient single-flight poller that reuses the server's `context.weather`.

**Tech Stack:** TypeScript strict, Next.js 16, React 19, Drizzle ORM, PostgreSQL, Zod, Vitest.

**Findings covered:** F-09 (unique rule ids), F-10 (theme guard + time format), F-15 (display polling), F-16 (server weather), F-18 (reason panel), F-19 (cache), F-20 (seeding race), F-21 (pure normalize), F-22 (error hygiene), F-23 (DB-layer tests).

**Depends on:** The correctness plan (for `HistorySummary` and the `rule_id` column). F-07 is already handled by that plan (Task 6, Step 4) and is not repeated here.

---

## File Structure

**Create:**
- `lib/ttl-cache.ts` — generic TTL cache.
- `lib/__tests__/ttl-cache.test.ts`.
- `lib/db/history-utils.ts` — `truncateToMinute`, `retentionCutoff`.
- `lib/db/__tests__/history-utils.test.ts`.
- `lib/db/__tests__/history.integration.test.ts` — real-DB idempotency/retention (skipped without `DATABASE_URL`).
- `components/frame/decision-debug.tsx` — the "why am I seeing this" overlay.

**Modify:**
- `lib/schema.ts` — unique rule ids, `time` format validation.
- `lib/__tests__/schema.test.ts` — new.
- `lib/albums.ts` — `themeMeta` guard.
- `components/frame/widget-content.tsx`, `components/frame/album-slideshow.tsx` — use `themeMeta`.
- `lib/store.ts` — TTL cache, race-safe seeding, pure `normalize`.
- `lib/__tests__/normalize.test.ts` — add immutability assertion.
- `app/api/display/state/route.ts`, `app/api/display/preview/route.ts` — error hygiene + 404.
- `lib/engine/state.ts` — `FrameNotFoundError`.
- `components/frame/frame-display.tsx` — single-flight poll, server weather, debug overlay.

---

### Task 1: Schema validation — unique rule ids and time format

**Files:**
- Modify: `lib/schema.ts`
- Create: `lib/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { experiencesSchema } from '../schema'

const base = {
  enabled: true,
  settings: { schoolHolidays: [] },
}

function rule(id: string, when: unknown) {
  return { id, name: id, enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } }
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
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/schema.test.ts`
Expected: FAIL on duplicate ids and invalid time.

- [ ] **Step 3: Tighten `lib/schema.ts`**

Replace the `time` branch inside `conditionSchema`:

```ts
    z.object({ time: z.object({ from: z.string(), to: z.string() }) }),
```

with (reusing the existing `clock` schema defined above for schedules):

```ts
    z.object({ time: z.object({ from: clock, to: clock }) }),
```

Replace the `experiencesSchema` definition:

```ts
export const experiencesSchema = z.object({
  enabled: z.boolean(),
  rules: z
    .array(experienceRuleSchema)
    .max(100)
    .superRefine((rules, ctx) => {
      const seen = new Set<string>()
      rules.forEach((rule, index) => {
        if (seen.has(rule.id)) {
          ctx.addIssue({ code: 'custom', message: `Duplicate rule id "${rule.id}"`, path: [index, 'id'] })
        }
        seen.add(rule.id)
      })
    }),
  settings: z.object({
    schoolHolidays: z.array(z.string()).max(100),
    timezone: z.string().max(100).optional(),
  }),
})
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/__tests__/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/schema.ts lib/__tests__/schema.test.ts
git commit -m "fix(schema): reject duplicate rule ids and malformed time conditions"
```

---

### Task 2: Guard unknown album themes

**Files:**
- Modify: `lib/albums.ts`
- Create: `lib/__tests__/albums.test.ts`
- Modify: `components/frame/widget-content.tsx`
- Modify: `components/frame/album-slideshow.tsx`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/albums.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { themeMeta, THEME_META } from '../albums'

describe('themeMeta', () => {
  it('returns the requested theme when known', () => {
    expect(themeMeta('music')).toBe(THEME_META.music)
  })

  it('falls back for unknown themes instead of throwing', () => {
    expect(themeMeta('podcasts' as never)).toBe(THEME_META.photos)
    expect(themeMeta(undefined as never)).toBe(THEME_META.photos)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/albums.test.ts`
Expected: FAIL — `themeMeta` is not exported.

- [ ] **Step 3: Add the guard to `lib/albums.ts`**

Add after `THEME_META`:

```ts
/** Safe lookup: legacy/imported albums may carry an unknown theme. */
export function themeMeta(theme: AlbumTheme | undefined): ThemeMeta {
  return (theme && THEME_META[theme]) || THEME_META.photos
}
```

- [ ] **Step 4: Use it in the Now Showing widget**

In `components/frame/widget-content.tsx`, add `themeMeta` to the `@/lib/albums` import (currently `import { THEME_META } from '@/lib/albums'`) — replace with:

```tsx
import { themeMeta } from '@/lib/albums'
```

and replace:

```tsx
  const label = String(props.label || '').trim() || THEME_META[theme].nowLabel
```

with:

```tsx
  const label = String(props.label || '').trim() || themeMeta(theme).nowLabel
```

- [ ] **Step 5: Use it in the slideshow**

In `components/frame/album-slideshow.tsx`, change the import:

```tsx
import { themeMeta } from '@/lib/albums'
```

and replace:

```tsx
  const meta = THEME_META[album.theme]
```

with:

```tsx
  const meta = themeMeta(album.theme)
```

- [ ] **Step 6: Typecheck and run**

Run: `npx tsc --noEmit && npx vitest run lib/__tests__/albums.test.ts`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add lib/albums.ts lib/__tests__/albums.test.ts components/frame/widget-content.tsx components/frame/album-slideshow.tsx
git commit -m "fix(frame): guard unknown album themes so the display cannot crash"
```

---

### Task 3: Bounded, freshening store cache

**Files:**
- Create: `lib/ttl-cache.ts`
- Create: `lib/__tests__/ttl-cache.test.ts`
- Modify: `lib/store.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/ttl-cache.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createTtlCache } from '../ttl-cache'

describe('createTtlCache', () => {
  it('returns a value within the TTL and expires it after', () => {
    let clock = 1000
    const cache = createTtlCache<string>(5000, () => clock)
    cache.set('a', 'value')
    expect(cache.get('a')).toBe('value')
    clock += 4999
    expect(cache.get('a')).toBe('value')
    clock += 1
    expect(cache.get('a')).toBeUndefined()
  })

  it('tracks size and clears', () => {
    const cache = createTtlCache<number>(1000)
    cache.set('a', 1)
    cache.set('b', 2)
    expect(cache.size()).toBe(2)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
    cache.clear()
    expect(cache.size()).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/ttl-cache.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/ttl-cache.ts`**

```ts
export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  delete(key: string): void
  clear(): void
  size(): number
}

/**
 * A tiny TTL cache. Used for the in-process frame store so a warm instance
 * serves fresh data instead of caching indefinitely (which caused stale stores
 * in multi-instance deployments).
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const map = new Map<string, { value: T; expiresAt: number }>()
  return {
    get(key) {
      const entry = map.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= now()) {
        map.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      map.set(key, { value, expiresAt: now() + ttlMs })
    },
    delete(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
    size() {
      return map.size
    },
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/__tests__/ttl-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in `lib/store.ts`**

Add the import:

```ts
import { createTtlCache } from './ttl-cache'
```

Replace:

```ts
const storeCache = new Map<string, FrameStore>()
```

with:

```ts
const STORE_CACHE_TTL_MS = 5_000
const storeCache = createTtlCache<FrameStore>(STORE_CACHE_TTL_MS)
```

The existing `storeCache.get` / `storeCache.set` calls are API-compatible and need no other change.

- [ ] **Step 6: Typecheck and run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/ttl-cache.ts lib/__tests__/ttl-cache.test.ts lib/store.ts
git commit -m "fix(store): bound the frame store cache with a TTL"
```

---

### Task 4: Race-safe seeding and pure `normalize`

**Files:**
- Modify: `lib/store.ts`
- Modify: `lib/__tests__/normalize.test.ts`

- [ ] **Step 1: Add the immutability assertion to the normalize test**

Append to `lib/__tests__/normalize.test.ts`:

```ts
  it('does not mutate the input store', () => {
    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test' }],
      schedule: { enabled: false, rules: [] },
      albums: [],
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Bad', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'deleted', state: 'ambient', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    } as any
    const snapshot = structuredClone(store)
    normalize(store)
    expect(store).toEqual(snapshot)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/normalize.test.ts`
Expected: FAIL — `normalize` currently reassigns `store.experiences`.

- [ ] **Step 3: Make `normalize` pure**

Replace the start of `normalize` in `lib/store.ts`:

```ts
export function normalize(store: FrameStore): FrameStore {
  // Add default experiences if missing
  if (!store.experiences) {
    store.experiences = { enabled: false, rules: [], settings: { schoolHolidays: [] } }
  }

  const schedule = store.schedule ?? structuredClone(DEFAULT_SCHEDULE)
  const albums = store.albums ?? [seedPhotoAlbum()]

  // Prune experience rules referencing deleted layouts
  const layoutIds = new Set(store.layouts.map(l => l.id))
  const rulesBefore = store.experiences.rules.length
  store.experiences.rules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  if (store.experiences.rules.length < rulesBefore) {
    console.log(`[normalize] Pruned ${rulesBefore - store.experiences.rules.length} experience rules referencing deleted layouts`)
  }

  return {
    ...store,
    albums,
    layouts: store.layouts.map((l) => ({ ... })),
    schedule: { ... },
  }
}
```

with:

```ts
export function normalize(store: FrameStore): FrameStore {
  const experiences = store.experiences ?? { enabled: false, rules: [], settings: { schoolHolidays: [] } }
  const schedule = store.schedule ?? structuredClone(DEFAULT_SCHEDULE)
  const albums = store.albums ?? [seedPhotoAlbum()]

  // Prune experience rules referencing deleted layouts (never mutate the input).
  const layoutIds = new Set(store.layouts.map(l => l.id))
  const prunedRules = experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  if (prunedRules.length < experiences.rules.length) {
    console.log(`[normalize] Pruned ${experiences.rules.length - prunedRules.length} experience rules referencing deleted layouts`)
  }

  return {
    ...store,
    experiences: { ...experiences, rules: prunedRules },
    albums,
    layouts: store.layouts.map((l) => ({
      ...l,
      settings: {
        ...DEFAULT_SETTINGS,
        ...l.settings,
        albumId: albums.some((a) => a.id === l.settings.albumId) ? l.settings.albumId : null,
      },
    })),
    schedule: {
      ...DEFAULT_SCHEDULE,
      ...schedule,
      night: { ...DEFAULT_SCHEDULE.night, ...schedule.night },
      rules: (schedule.rules ?? []).filter((r) => store.layouts.some((l) => l.id === r.layoutId)),
    },
  }
}
```

- [ ] **Step 4: Make seeding race-safe**

Replace the seeding branch in `readStore`:

```ts
  if (frameId !== DEFAULT_FRAME_ID) return null

  const store = seed()
  const now = new Date()
  await db.insert(frameDocuments).values({
    id: nanoid(12), identifier: frameId, name: frameId === DEFAULT_FRAME_ID ? 'Home frame' : frameId,
    data: store, createdAt: now, updatedAt: now,
    resolutionWidth: 1920, resolutionHeight: 1080,
  })
  storeCache.set(frameId, store)
  return store
```

with:

```ts
  if (frameId !== DEFAULT_FRAME_ID) return null

  const store = seed()
  const now = new Date()
  // Two concurrent first requests can both miss the cache; ON CONFLICT makes
  // the loser a no-op, then re-select to return the winning document.
  await db
    .insert(frameDocuments)
    .values({
      id: nanoid(12),
      identifier: frameId,
      name: 'Home frame',
      data: store,
      createdAt: now,
      updatedAt: now,
      resolutionWidth: 1920,
      resolutionHeight: 1080,
    })
    .onConflictDoNothing({ target: frameDocuments.identifier })

  const [created] = await db.select().from(frameDocuments).where(eq(frameDocuments.identifier, frameId)).limit(1)
  const resolved = created ? normalize(created.data as FrameStore) : store
  storeCache.set(frameId, resolved)
  return resolved
```

- [ ] **Step 5: Typecheck and run**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; normalize tests pass including immutability.

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts lib/__tests__/normalize.test.ts
git commit -m "fix(store): race-safe seeding and pure normalize"
```

---

### Task 5: Error hygiene and 404 for missing frames

**Files:**
- Modify: `lib/engine/state.ts`
- Modify: `app/api/display/state/route.ts`
- Modify: `app/api/display/preview/route.ts`
- Test: `lib/__tests__/state-errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/state-errors.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../store', () => ({ readStore: vi.fn() }))
vi.mock('../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../db', () => ({ queryHistory: vi.fn(), recordDecision: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision, FrameNotFoundError } from '../engine/state'

describe('getDecision missing frame', () => {
  it('throws FrameNotFoundError when the store is absent', async () => {
    const { readStore } = await import('../store')
    vi.mocked(readStore).mockResolvedValue(null)
    await expect(getDecision('ghost')).rejects.toBeInstanceOf(FrameNotFoundError)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/state-errors.test.ts`
Expected: FAIL — `FrameNotFoundError` not exported.

- [ ] **Step 3: Add the error class**

In `lib/engine/state.ts`, add near the top:

```ts
export class FrameNotFoundError extends Error {
  constructor(frameId: string) {
    super(`Frame "${frameId}" not found`)
    this.name = 'FrameNotFoundError'
  }
}
```

Replace:

```ts
  if (!store) throw new Error(`Frame "${frameId}" not found`)
```

with:

```ts
  if (!store) throw new FrameNotFoundError(frameId)
```

- [ ] **Step 4: Map errors in the routes**

In `app/api/display/state/route.ts`, import the error and replace the catch:

```ts
import { getDecision, FrameNotFoundError } from '@/lib/engine/state'
```

```ts
  } catch (error) {
    if (error instanceof FrameNotFoundError) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 })
    }
    console.error('[display/state] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
```

Apply the identical change in `app/api/display/preview/route.ts` (import and catch), logging with `'[display/preview] Error:'`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; new test passes.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/state.ts app/api/display/state/route.ts app/api/display/preview/route.ts lib/__tests__/state-errors.test.ts
git commit -m "fix(api): return 404 for missing frames and stop leaking internal errors"
```

---

### Task 6: DB-layer utilities and idempotency tests

**Files:**
- Create: `lib/db/history-utils.ts`
- Create: `lib/db/__tests__/history-utils.test.ts`
- Create: `lib/db/__tests__/history.integration.test.ts`
- Modify: `lib/db/index.ts`

- [ ] **Step 1: Write the failing unit test**

Create `lib/db/__tests__/history-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { truncateToMinute, retentionCutoff } from '../history-utils'

describe('truncateToMinute', () => {
  it('drops seconds and milliseconds', () => {
    expect(truncateToMinute(new Date('2026-10-08T10:15:42.987Z')).toISOString()).toBe('2026-10-08T10:15:00.000Z')
  })
})

describe('retentionCutoff', () => {
  it('subtracts the retention window', () => {
    const now = new Date('2026-10-08T10:00:00.000Z')
    expect(retentionCutoff(now, 7 * 24 * 60 * 60 * 1000).toISOString()).toBe('2026-10-01T10:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/db/__tests__/history-utils.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/db/history-utils.ts`**

```ts
export function truncateToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000)
}

export function retentionCutoff(now: Date, retentionMs: number): Date {
  return new Date(now.getTime() - retentionMs)
}
```

- [ ] **Step 4: Use them in `lib/db/index.ts`**

Add the import:

```ts
import { retentionCutoff, truncateToMinute } from './history-utils'
```

Replace in `recordDecision`:

```ts
  const shownAtMinute = new Date(Math.floor(shownAt.getTime() / 60000) * 60000)
  const cutoff = new Date(Date.now() - RETENTION_MS)
```

with:

```ts
  const shownAtMinute = truncateToMinute(shownAt)
  const cutoff = retentionCutoff(new Date(), RETENTION_MS)
```

Replace in `pruneHistory`:

```ts
  const cutoff = new Date(Date.now() - RETENTION_MS)
```

with:

```ts
  const cutoff = retentionCutoff(new Date(), RETENTION_MS)
```

- [ ] **Step 5: Run the unit test**

Run: `npx vitest run lib/db/__tests__/history-utils.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the real-DB integration test**

Create `lib/db/__tests__/history.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

suite('display_history integration', () => {
  const frameId = `test-frame-${Date.now()}`
  let recordDecision: typeof import('../index').recordDecision
  let queryHistory: typeof import('../index').queryHistory

  beforeAll(async () => {
    ;({ recordDecision, queryHistory } = await import('../index'))
  })

  afterAll(async () => {
    const { getDb } = await import('../index')
    const { displayHistory } = await import('../schema')
    const { eq } = await import('drizzle-orm')
    await getDb().delete(displayHistory).where(eq(displayHistory.frameId, frameId))
  })

  it('appends a decision once within the same minute (idempotent)', async () => {
    const decision = { id: 'decision-1', layoutId: 'l1', ruleId: 'r1', score: 120 }
    const at = new Date('2026-10-08T10:15:42.000Z')
    await recordDecision(frameId, decision, at)
    await recordDecision(frameId, decision, at)
    const summary = await queryHistory(frameId, at, 120 * 60 * 1000)
    expect(summary.recent.filter(r => r.layoutId === 'l1')).toHaveLength(1)
    expect(summary.latestLayoutId).toBe('l1')
  })

  it('excludes layouts older than the retention window from novelty', async () => {
    const decision = { id: 'decision-old', layoutId: 'l-old', ruleId: 'r1', score: 10 }
    const at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await recordDecision(frameId, decision, at)
    const summary = await queryHistory(frameId, new Date(), 120 * 60 * 1000)
    expect(summary.seenLayouts.has('l-old')).toBe(false)
  })
})
```

- [ ] **Step 7: Run with and without a database**

Run: `npx vitest run lib/db/__tests__`
Expected: without `DATABASE_URL`, the integration suite is skipped and the unit test passes. With `DATABASE_URL` set (and the migration applied), both pass.

- [ ] **Step 8: Commit**

```bash
git add lib/db/history-utils.ts lib/db/__tests__/history-utils.test.ts lib/db/__tests__/history.integration.test.ts lib/db/index.ts
git commit -m "test(db): history utils and idempotent-append integration coverage"
```

---

### Task 7: Harden the display poll (single-flight, abort, ordering)

**Files:**
- Modify: `components/frame/frame-display.tsx`

- [ ] **Step 1: Replace the polling effect**

In `components/frame/frame-display.tsx`, add the context import and state, then replace the `useEffect`.

Add `ExperienceContext` to the type import from `@/lib/types` and add state:

```tsx
  const [context, setContext] = useState<ExperienceContext | null>(null)
```

Replace the entire existing polling `useEffect` (currently ~L31-57) with:

```tsx
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let sequence = 0
    let applied = -1

    async function poll() {
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 25_000)
      const seq = ++sequence
      try {
        const res = await fetch(`/api/display/state?frame=${encodeURIComponent(frameId)}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled || seq < applied) return
        applied = seq
        setDecision(prev => (prev?.id === data.decision?.id ? prev : data.decision))
        setStore(data.store)
        setContext(data.context ?? null)
      } catch (error) {
        if (!cancelled && (error as Error).name !== 'AbortError') {
          console.error('[FrameDisplay] Poll failed:', error)
        }
      } finally {
        clearTimeout(timeout)
        if (!cancelled) timer = setTimeout(poll, 30_000)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [frameId])
```

- [ ] **Step 2: Prefer the server's weather**

Replace:

```tsx
  const weather = useWeather(layout?.settings ?? { lat: 0, lon: 0, units: 'metric' })
```

with:

```tsx
  const clientWeather = useWeather(layout?.settings ?? { lat: 0, lon: 0, units: 'metric' })
  const weather = context?.weather ?? clientWeather
```

- [ ] **Step 3: Typecheck, build, run**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/frame`. In DevTools, throttle to Slow 3G and confirm (a) no two `/api/display/state` requests overlap, (b) the next request starts only after the previous finishes, and (c) navigating away aborts the in-flight request. Confirm the weather widget matches the layout chosen by the engine during a rain rule.

- [ ] **Step 5: Commit**

```bash
git add components/frame/frame-display.tsx
git commit -m "fix(display): single-flight polling with abort, ordering, and server weather"
```

---

### Task 8: "Why am I seeing this?" diagnostics overlay

**Files:**
- Create: `components/frame/decision-debug.tsx`
- Modify: `components/frame/frame-display.tsx`

- [ ] **Step 1: Create the overlay component**

Create `components/frame/decision-debug.tsx`:

```tsx
'use client'

import type { DisplayDecision, ExperienceContext } from '@/lib/types'

export function DecisionDebug({ decision, context }: { decision: DisplayDecision | null; context: ExperienceContext | null }) {
  if (!decision) return null
  const rows: [string, string][] = [
    ['Reason', decision.reason],
    ['Rule', decision.ruleId ?? 'none (fallback)'],
    ['Layout', decision.layoutId],
    ['Bob', decision.bob?.expression ?? 'none'],
    ['Score', String(decision.score)],
    ['Priority', String(decision.priority)],
    ['Period', context?.period ?? 'unknown'],
    ['Generated', decision.generatedAt],
  ]
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-50 max-w-md rounded-lg bg-black/75 p-3 font-mono text-[11px] leading-relaxed text-white shadow-lg">
      <p className="mb-1 font-semibold uppercase tracking-wider text-white/60">Why am I seeing this?</p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span className="text-white/60">{label}</span>
          <span className="truncate">{value}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Render it when the frame is in debug mode**

In `components/frame/frame-display.tsx`, add the import:

```tsx
import { DecisionDebug } from './decision-debug'
```

Add state and an effect near the other hooks:

```tsx
  const [debug, setDebug] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDebug(params.get('debug') === '1')
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'd') setDebug(value => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
```

Render it inside `<main>` after `<FrameScene ... />`:

```tsx
      {debug && <DecisionDebug decision={decision} context={context} />}
```

- [ ] **Step 3: Typecheck, build, run**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/frame?debug=1` and press `d`; confirm the panel shows the reason, rule, score, and period, and that it never appears without the flag/keypress.

- [ ] **Step 5: Commit**

```bash
git add components/frame/decision-debug.tsx components/frame/frame-display.tsx
git commit -m "feat(display): optional why-am-i-seeing-this diagnostics overlay"
```

---

### Task 9: Final verification for this plan

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean.

- [ ] **Step 2: Apply the migration**

Run: `npx drizzle-kit migrate`
Expected: `0001_add_rule_id_to_display_history.sql` applied (no-op if already applied).

- [ ] **Step 3: Run the DB integration suite**

Run: `DATABASE_URL="$DATABASE_URL" npx vitest run lib/db/__tests__`
Expected: idempotency and retention tests pass.

- [ ] **Step 4: Manual hardening checks**

- Import a layout with a bob widget whose `expression` is `"dancing"`; confirm the widget shows the placeholder and does not loop requests.
- Inject an album with `theme: "podcasts"` into the store JSON; confirm `/frame` renders without crashing.
- Load the editor in one tab and the display in another; edit a rule and confirm the display picks it up within ~35 seconds (cache TTL + poll).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify bob engine hardening and display remediation"
```

---

## Self-Review

- **F-09** — Task 1 (duplicate id refinement). ✅
- **F-10** — Task 1 (time format) + Task 2 (theme guard). ✅
- **F-15** — Task 7 (single-flight poll, abort, ordering). ✅
- **F-16** — Task 7 Step 2 (server weather preferred). ✅
- **F-18** — Task 8 (debug overlay). ✅
- **F-19** — Task 3 (TTL cache). ✅
- **F-20** — Task 4 (ON CONFLICT + re-select). ✅
- **F-21** — Task 4 (pure normalize). ✅
- **F-22** — Task 5 (404 + generic 500). ✅
- **F-23** — Task 6 (history utils + integration tests); remaining engine gaps are covered by the correctness plan. ✅

Type consistency: `themeMeta` is defined and tested in Task 2 before use; `createTtlCache` is defined in Task 3 and used in Task 4; `truncateToMinute`/`retentionCutoff` are defined in Task 6 before use in `lib/db/index.ts`; `FrameNotFoundError` is exported in Task 5 and imported by both routes; `DecisionDebug` props match `DisplayDecision | null` and `ExperienceContext | null`. `context` state is declared in Task 7 and consumed in Task 8. No placeholders.

**Cross-plan note:** F-07 (timezone unification) is implemented in the correctness plan (Task 6, Step 4) and intentionally not repeated here. If this plan is executed without the correctness plan, add `const timezone = store.experiences.settings.timezone || 'UTC'` to `getDecision` before using `simulatedWallTime`.
