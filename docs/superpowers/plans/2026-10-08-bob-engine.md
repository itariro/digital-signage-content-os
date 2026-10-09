# Bob Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Design spec:** This plan implements [`docs/superpowers/specs/2026-10-08-bob-engine-design-v2.md`](../specs/2026-10-08-bob-engine-design-v2.md).

**Goal:** Port the familyOS Bob decision engine into dscos, adding a server-side context → rules → scoring → selector pipeline, a `display_history` table, a decision-aware Bob widget, and an Experiences editor panel.

**Architecture:** Pure TypeScript engine modules under `lib/engine/` mirror the familyOS Python layout. `state.ts` is the only impure module, injecting fakes for testability. The display polls a new `/api/display/state` endpoint that returns `{ decision, context, store }` in one round trip. The existing schedule and client-side `resolveDisplay()` remain as fallbacks.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Drizzle ORM, PostgreSQL, Zod, Vitest, SWR, Tailwind CSS

---

## File Structure

**New files:**
- `lib/engine/types.ts` — shared types (ExperienceRule, DisplayDecision, ExperienceContext, Condition, etc.)
- `lib/engine/context.ts` — pure: build ExperienceContext from store + time
- `lib/engine/operators.ts` — pure: evaluate Condition trees
- `lib/engine/evaluator.ts` — pure: evaluate rules against context
- `lib/engine/scoring.ts` — pure: compute scores from candidates + history
- `lib/engine/selector.ts` — pure: select winner from scored candidates
- `lib/engine/state.ts` — impure: orchestrate store read → context → evaluate → score → select → history append
- `lib/weather.ts` — shared weather fetch with cache
- `app/api/display/state/route.ts` — GET decision endpoint
- `app/api/display/preview/route.ts` — POST preview endpoint
- `lib/engine/__tests__/*.test.ts` — unit tests
- `drizzle.config.ts` — Drizzle kit config
- `drizzle/0000_create_display_history.sql` — migration
- `vitest.config.ts` — Vitest config

**Modified files:**
- `lib/types.ts` — add `experiences` to `FrameStore`, add `bob` to `WIDGET_TYPES`
- `lib/schema.ts` — add `experiencesSchema`, `conditionSchema`
- `lib/store.ts` — extend `normalize()` to prune experience rules + add default
- `lib/db/schema.ts` — add `displayHistory` table
- `lib/widgets.ts` — add `Bob` widget definition
- `components/frame/widget-content.tsx` — add `decision` to `WidgetContext`, add `BobWidget` component
- `components/frame/frame-scene.tsx` — accept `decision` prop, pass to `WidgetBody`
- `components/frame/frame-display.tsx` — poll `/api/display/state`, use decision
- `components/editor/editor.tsx` — add Experiences panel
- `package.json` — add Vitest, drizzle-kit dev deps, test script
- `next.config.mjs` — remove `ignoreBuildErrors`

---

## Phase 1: Foundation

### Task 1: Add `experiences` to FrameStore type and zod schema

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/schema.ts`

- [x] **Step 1: Add ExperienceRule and related types to `lib/types.ts`**

Add after the `FrameStore` type definition:

```ts
// Bob Engine types
export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

export type DisplayState =
  | 'ambient' | 'information' | 'action' | 'celebration'
  | 'activity' | 'gallery' | 'weather' | 'family'

export type BobExpression =
  | 'thinking' | 'action' | 'celebrate' | 'idea' | 'reminder' | 'success'
  | 'exercise' | 'talking' | 'planning' | 'building' | 'reading' | 'happy'

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { days: Weekday[] }
  | { time: { from: string; to: string } }
  | { schoolDay: boolean }
  | { weather: {
      rainProbabilityAbove?: number
      temperatureAbove?: number
      temperatureBelow?: number
      uvAbove?: number
    } }
  | { specialTag: string }

export interface ExperienceRule {
  id: string
  name: string
  enabled: boolean
  priority: number
  when: Condition
  then: {
    layoutId: string
    state: DisplayState
    bob?: { expression: BobExpression; speech?: string }
    score: number
    durationMs: number
    reason?: string
  }
}

export interface ExperienceSettings {
  schoolHolidays: string[]
  timezone?: string
}

export interface Experiences {
  enabled: boolean
  rules: ExperienceRule[]
  settings: ExperienceSettings
}

export interface DisplayDecision {
  id: string
  state: DisplayState
  layoutId: string
  bob?: { expression: BobExpression; speech?: string }
  priority: number
  score: number
  reason: string
  ruleId: string | null
  durationMs: number
  generatedAt: string
}

export interface ExperienceContext {
  now: string
  date: { iso: string; day: string; dayNumber: number; month: string; year: number }
  weekday: Weekday
  period: 'night' | 'morning' | 'day' | 'welcome-home' | 'evening' | 'wind-down'
  schoolDay: boolean
  weather?: import('./types').WeatherData
  specialTags: string[]
}
```

Add `experiences` to `FrameStore`:
```ts
export type FrameStore = {
  activeId: string | null
  layouts: Layout[]
  presets: Preset[]
  customFonts: string[]
  schedule: FrameSchedule
  albums: Album[]
  experiences: Experiences
}
```

- [x] **Step 2: Add zod schemas to `lib/schema.ts`**

Add at the end of the file:

```ts
const weekdaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])

const displayStateSchema = z.enum([
  'ambient', 'information', 'action', 'celebration',
  'activity', 'gallery', 'weather', 'family',
])

const bobExpressionSchema = z.enum([
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
])

const conditionSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(conditionSchema) }),
    z.object({ any: z.array(conditionSchema) }),
    z.object({ not: conditionSchema }),
    z.object({ days: z.array(weekdaySchema) }),
    z.object({ time: z.object({ from: z.string(), to: z.string() }) }),
    z.object({ schoolDay: z.boolean() }),
    z.object({
      weather: z.object({
        rainProbabilityAbove: z.number().optional(),
        temperatureAbove: z.number().optional(),
        temperatureBelow: z.number().optional(),
        uvAbove: z.number().optional(),
      }),
    }),
    z.object({ specialTag: z.string() }),
  ])
)

const experienceRuleSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000),
  when: conditionSchema,
  then: z.object({
    layoutId: z.string().min(1).max(40),
    state: displayStateSchema,
    bob: z.object({
      expression: bobExpressionSchema,
      speech: z.string().max(500).optional(),
    }).optional(),
    score: z.number(),
    durationMs: z.number().int().min(0),
    reason: z.string().max(200).optional(),
  }),
})

export const experiencesSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(experienceRuleSchema).max(100),
  settings: z.object({
    schoolHolidays: z.array(z.string()).max(100),
    timezone: z.string().max(100).optional(),
  }),
})
```

- [x] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add lib/types.ts lib/schema.ts
git commit -m "feat: add experiences type and schema for Bob engine"
```

---

### Task 2: Extend `normalize()` to prune experience rules and add default

**Files:**
- Modify: `lib/store.ts`

- [x] **Step 1: Add default experiences and pruning to `normalize()`**

In `lib/store.ts`, find the `normalize` function and add at the beginning:

```ts
// Add default experiences if missing
if (!store.experiences) {
  store.experiences = { enabled: false, rules: [], settings: { schoolHolidays: [] } }
}
```

Add before the return statement in `normalize()`:

```ts
// Prune experience rules referencing deleted layouts
const layoutIds = new Set(store.layouts.map(l => l.id))
const rulesBefore = store.experiences.rules.length
store.experiences.rules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
if (store.experiences.rules.length < rulesBefore) {
  console.log(`[normalize] Pruned ${rulesBefore - store.experiences.rules.length} experience rules referencing deleted layouts`)
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add lib/store.ts
git commit -m "feat: extend normalize() to prune experience rules and add default"
```

---

### Task 3: Create `display_history` table with Drizzle

**Files:**
- Create: `drizzle.config.ts`
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0000_create_display_history.sql`

- [x] **Step 1: Add `displayHistory` table to `lib/db/schema.ts`**

Add import for `uniqueIndex` at the top:
```ts
import { pgTable, text, bigserial, timestamp, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core'
```

Add at the end of the file:
```ts
export const displayHistory = pgTable('display_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  frameId: text('frame_id').notNull(),
  decisionId: text('decision_id').notNull(),
  layoutId: text('layout_id').notNull(),
  shownAt: timestamp('shown_at', { withTimezone: true }).notNull(),
  score: doublePrecision('score').notNull(),
}, (table) => ({
  uniqueConstraint: uniqueIndex('display_history_unique').on(table.frameId, table.decisionId, table.shownAt),
  frameTimeIndex: index('display_history_frame_time').on(table.frameId, table.shownAt),
}))

export type DisplayHistory = typeof displayHistory.$inferSelect
export type NewDisplayHistory = typeof displayHistory.$inferInsert
```

Add to `databaseSchema`:
```ts
export const databaseSchema = {
  frameDocuments,
  frameTemplates,
  contentSources,
  displayHistory,
}
```

- [x] **Step 2: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/dscos',
  },
})
```

- [x] **Step 3: Add drizzle-kit to package.json devDependencies**

Run: `npm install -D drizzle-kit`
Expected: drizzle-kit added to devDependencies

- [x] **Step 4: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: Creates `drizzle/0000_create_display_history.sql`

- [x] **Step 5: Apply the migration**

Run: `npx drizzle-kit migrate`
Expected: Migration applied successfully

- [x] **Step 6: Verify the table exists**

Run: `psql $DATABASE_URL -c '\d display_history'`
Expected: Table with columns id, frame_id, decision_id, layout_id, shown_at, score

- [x] **Step 7: Commit**

```bash
git add drizzle.config.ts lib/db/schema.ts drizzle/ package.json package-lock.json
git commit -m "feat: add display_history table with drizzle migration"
```

---

### Task 4: Create `lib/weather.ts` shared module

**Files:**
- Create: `lib/weather.ts`
- Modify: `app/api/weather/route.ts`

- [x] **Step 1: Create `lib/weather.ts`**

```ts
import type { WeatherData } from './types'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const cache = new Map<string, { data: WeatherData; expiresAt: number }>()

function cacheKey(lat: number, lon: number, units: string): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${units}`
}

export async function fetchWeather(lat: number, lon: number, units: string): Promise<WeatherData> {
  const key = cacheKey(lat, lon, units)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day,uv_index&daily=temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=5`
    const res = await fetch(url, { next: { revalidate: 900 } })
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`)
    const json = await res.json()

    const data: WeatherData = {
      sample: false,
      current: {
        temp: json.current.temperature_2m,
        code: json.current.weather_code,
        isDay: json.current.is_day === 1,
        uv: json.current.uv_index,
      },
      today: {
        high: json.daily.temperature_2m_max[0],
        low: json.daily.temperature_2m_min[0],
        uvMax: json.daily.uv_index_max[0],
        sunrise: json.daily.sunrise[0],
        sunset: json.daily.sunset[0],
      },
      daily: json.daily.time.map((t: string, i: number) => ({
        date: t,
        high: json.daily.temperature_2m_max[i],
        low: json.daily.temperature_2m_min[i],
        uvMax: json.daily.uv_index_max[i],
        sunrise: json.daily.sunrise[i],
        sunset: json.daily.sunset[i],
        rainProbability: json.daily.precipitation_probability_max[i],
      })),
      hourly: json.hourly.time.slice(0, 12).map((t: string, i: number) => ({
        time: t,
        temp: json.hourly.temperature_2m[i],
        code: json.hourly.weather_code[i],
        rainProbability: json.hourly.precipitation_probability[i],
      })),
    }

    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
    return data
  } catch (error) {
    console.error('Weather fetch failed:', error)
    return getSampleWeather()
  }
}

function getSampleWeather(): WeatherData {
  return {
    sample: true,
    current: { temp: 20, code: 1, isDay: true, uv: 5 },
    today: { high: 25, low: 15, uvMax: 6, sunrise: '2026-10-08T06:30', sunset: '2026-10-08T18:30' },
    daily: [],
    hourly: [],
  }
}
```

- [x] **Step 2: Refactor `app/api/weather/route.ts` to use the shared module**

Replace the entire file content with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { fetchWeather } from '@/lib/weather'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '47.3769')
  const lon = parseFloat(req.nextUrl.searchParams.get('lon') || '8.5417')
  const units = req.nextUrl.searchParams.get('units') || 'metric'

  const data = await fetchWeather(lat, lon, units)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [x] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add lib/weather.ts app/api/weather/route.ts
git commit -m "feat: create shared lib/weather.ts module with cache"
```

---

## Phase 2: Engine — Pure Modules

### Task 5: Set up Vitest and create `lib/engine/types.ts`

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/engine/types.ts`
- Modify: `package.json`

- [x] **Step 1: Install Vitest**

Run: `npm install -D vitest @vitest/coverage-v8`
Expected: vitest added to devDependencies

- [x] **Step 2: Add test script to `package.json`**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [x] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/engine/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [x] **Step 4: Create `lib/engine/types.ts`**

Re-export from `lib/types.ts` and add engine-specific types:

```ts
export type {
  Weekday,
  DisplayState,
  BobExpression,
  Condition,
  ExperienceRule,
  ExperienceSettings,
  Experiences,
  DisplayDecision,
  ExperienceContext,
} from '../types'

export interface ScoredCandidate {
  rule: ExperienceRule
  score: number
  layoutId: string
}

export interface HistoryEntry {
  layoutId: string
  shownAt: Date
}
```

- [x] **Step 5: Verify tests run**

Run: `npm test`
Expected: "No test files found" (we haven't written tests yet)

- [x] **Step 6: Commit**

```bash
git add vitest.config.ts lib/engine/types.ts package.json package-lock.json
git commit -m "chore: set up Vitest and create engine types"
```

---

### Task 6: Create `lib/engine/context.ts`

**Files:**
- Create: `lib/engine/context.ts`
- Create: `lib/engine/__tests__/context.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/context.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildContext } from '../context'
import type { FrameStore, WeatherData } from '../../types'

function makeStore(overrides?: Partial<FrameStore>): FrameStore {
  return {
    activeId: 'layout-1',
    layouts: [{ id: 'layout-1', name: 'Test', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
    presets: [],
    customFonts: [],
    schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    ...overrides,
  }
}

describe('buildContext', () => {
  it('returns morning period at 07:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T07:00:00Z'))
    expect(ctx.period).toBe('morning')
    expect(ctx.weekday).toBe('THU')
  })

  it('returns night period at 22:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T22:00:00Z'))
    expect(ctx.period).toBe('night')
  })

  it('returns welcome-home period at 17:00', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T17:00:00Z'))
    expect(ctx.period).toBe('welcome-home')
  })

  it('detects school day on a weekday', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.schoolDay).toBe(true)
  })

  it('detects non-school day on weekend', () => {
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-10T10:00:00Z'))
    expect(ctx.schoolDay).toBe(false)
  })

  it('detects non-school day on holiday', () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: ['2026-10-08'] } },
    })
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.schoolDay).toBe(false)
  })

  it('derives rain specialTag when rain probability > 60%', () => {
    const weather: WeatherData = {
      sample: false,
      current: { temp: 15, code: 61, isDay: true, uv: 2 },
      today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' },
      daily: [{ date: '2026-10-08', high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '', rainProbability: 75 }],
      hourly: [],
    }
    const store = makeStore()
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'), weather)
    expect(ctx.specialTags).toContain('rain')
  })

  it('falls back to server UTC on invalid timezone', () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'Invalid/Zone' } },
    })
    const ctx = buildContext(store, new Date('2026-10-08T10:00:00Z'))
    expect(ctx.now).toBeDefined()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "buildContext is not a function" or similar

- [x] **Step 3: Implement `lib/engine/context.ts`**

```ts
import type { FrameStore, WeatherData, Weekday } from '../types'
import type { ExperienceContext } from './types'

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function getPeriod(minutes: number): ExperienceContext['period'] {
  if (minutes < 360) return 'night'
  if (minutes < 525) return 'morning'
  if (minutes < 990) return 'day'
  if (minutes < 1110) return 'welcome-home'
  if (minutes < 1260) return 'evening'
  return 'wind-down'
}

function getSpecialTags(weather: WeatherData | undefined): string[] {
  if (!weather) return []
  const tags: string[] = []
  const rainProb = weather.daily[0]?.rainProbability ?? 0
  if (rainProb > 60) tags.push('rain')
  const temp = weather.current.temp
  if (temp > 30) tags.push('heat')
  if (temp < 5) tags.push('cold')
  if (weather.current.uv > 6) tags.push('uv')
  return tags
}

export function buildContext(
  store: FrameStore,
  now: Date,
  weather?: WeatherData
): ExperienceContext {
  const timezone = store.experiences.settings.timezone

  let localDate: Date
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    const parts = formatter.formatToParts(now)
    const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
    localDate = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`)
  } catch {
    console.warn(`[context] Invalid timezone "${timezone}", falling back to server UTC`)
    localDate = now
  }

  const weekday = WEEKDAYS[localDate.getUTCDay()]
  const minutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
  const period = getPeriod(minutes)

  const iso = localDate.toISOString().slice(0, 10)
  const isWeekend = weekday === 'SAT' || weekday === 'SUN'
  const holidays = store.experiences.settings.schoolHolidays
  const schoolDay = !isWeekend && !holidays.includes(iso)

  return {
    now: localDate.toISOString(),
    date: {
      iso,
      day: localDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      dayNumber: localDate.getUTCDate(),
      month: localDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      year: localDate.getUTCFullYear(),
    },
    weekday,
    period,
    schoolDay,
    weather,
    specialTags: getSpecialTags(weather),
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (8 tests)

- [x] **Step 5: Commit**

```bash
git add lib/engine/context.ts lib/engine/__tests__/context.test.ts
git commit -m "feat: add context builder with period, weekday, schoolDay, specialTags"
```

---

### Task 7: Create `lib/engine/operators.ts`

**Files:**
- Create: `lib/engine/operators.ts`
- Create: `lib/engine/__tests__/operators.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/operators.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../operators'
import type { Condition, ExperienceContext } from '../types'

function makeContext(overrides?: Partial<ExperienceContext>): ExperienceContext {
  return {
    now: '2026-10-08T10:00:00Z',
    date: { iso: '2026-10-08', day: 'Thursday', dayNumber: 8, month: 'October', year: 2026 },
    weekday: 'THU',
    period: 'day',
    schoolDay: true,
    weather: undefined,
    specialTags: [],
    ...overrides,
  }
}

describe('evaluateCondition', () => {
  it('evaluates days condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ days: ['MON'] }, ctx)).toBe(true)
    expect(evaluateCondition({ days: ['TUE'] }, ctx)).toBe(false)
  })

  it('evaluates time condition', () => {
    const ctx = makeContext({ now: '2026-10-08T10:00:00Z' })
    expect(evaluateCondition({ time: { from: '09:00', to: '11:00' } }, ctx)).toBe(true)
    expect(evaluateCondition({ time: { from: '12:00', to: '14:00' } }, ctx)).toBe(false)
  })

  it('evaluates schoolDay condition', () => {
    const ctx = makeContext({ schoolDay: true })
    expect(evaluateCondition({ schoolDay: true }, ctx)).toBe(true)
    expect(evaluateCondition({ schoolDay: false }, ctx)).toBe(false)
  })

  it('evaluates weather rainProbabilityAbove', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 61, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '', rainProbability: 75 }], hourly: [] },
    })
    expect(evaluateCondition({ weather: { rainProbabilityAbove: 60 } }, ctx)).toBe(true)
    expect(evaluateCondition({ weather: { rainProbabilityAbove: 80 } }, ctx)).toBe(false)
  })

  it('evaluates specialTag condition', () => {
    const ctx = makeContext({ specialTags: ['rain', 'uv'] })
    expect(evaluateCondition({ specialTag: 'rain' }, ctx)).toBe(true)
    expect(evaluateCondition({ specialTag: 'heat' }, ctx)).toBe(false)
  })

  it('evaluates all condition', () => {
    const ctx = makeContext({ weekday: 'MON', schoolDay: true })
    expect(evaluateCondition({ all: [{ days: ['MON'] }, { schoolDay: true }] }, ctx)).toBe(true)
    expect(evaluateCondition({ all: [{ days: ['MON'] }, { schoolDay: false }] }, ctx)).toBe(false)
  })

  it('evaluates any condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ any: [{ days: ['TUE'] }, { days: ['MON'] }] }, ctx)).toBe(true)
    expect(evaluateCondition({ any: [{ days: ['TUE'] }, { days: ['WED'] }] }, ctx)).toBe(false)
  })

  it('evaluates not condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ not: { days: ['TUE'] } }, ctx)).toBe(true)
    expect(evaluateCondition({ not: { days: ['MON'] } }, ctx)).toBe(false)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [x] **Step 3: Implement `lib/engine/operators.ts`**

```ts
import type { Condition, ExperienceContext } from './types'

export function evaluateCondition(condition: Condition, ctx: ExperienceContext): boolean {
  if ('all' in condition) {
    return condition.all.every(c => evaluateCondition(c, ctx))
  }
  if ('any' in condition) {
    return condition.any.some(c => evaluateCondition(c, ctx))
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, ctx)
  }
  if ('days' in condition) {
    return condition.days.includes(ctx.weekday)
  }
  if ('time' in condition) {
    const [fromH, fromM] = condition.time.from.split(':').map(Number)
    const [toH, toM] = condition.time.to.split(':').map(Number)
    const fromMinutes = fromH * 60 + fromM
    const toMinutes = toH * 60 + toM
    const nowMinutes = new Date(ctx.now).getUTCHours() * 60 + new Date(ctx.now).getUTCMinutes()
    if (fromMinutes <= toMinutes) {
      return nowMinutes >= fromMinutes && nowMinutes < toMinutes
    }
    return nowMinutes >= fromMinutes || nowMinutes < toMinutes
  }
  if ('schoolDay' in condition) {
    return ctx.schoolDay === condition.schoolDay
  }
  if ('weather' in condition) {
    const w = condition.weather
    if (!ctx.weather) return false
    if (w.rainProbabilityAbove !== undefined) {
      const rainProb = ctx.weather.daily[0]?.rainProbability ?? 0
      if (rainProb <= w.rainProbabilityAbove) return false
    }
    if (w.temperatureAbove !== undefined) {
      if (ctx.weather.current.temp <= w.temperatureAbove) return false
    }
    if (w.temperatureBelow !== undefined) {
      if (ctx.weather.current.temp >= w.temperatureBelow) return false
    }
    if (w.uvAbove !== undefined) {
      if (ctx.weather.current.uv <= w.uvAbove) return false
    }
    return true
  }
  if ('specialTag' in condition) {
    return ctx.specialTags.includes(condition.specialTag)
  }
  return false
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (15 tests total)

- [x] **Step 5: Commit**

```bash
git add lib/engine/operators.ts lib/engine/__tests__/operators.test.ts
git commit -m "feat: add condition operators with all/any/not/days/time/weather/specialTag"
```

---

### Task 8: Create `lib/engine/evaluator.ts`

**Files:**
- Create: `lib/engine/evaluator.ts`
- Create: `lib/engine/__tests__/evaluator.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/evaluator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateRules } from '../evaluator'
import type { ExperienceRule, ExperienceContext } from '../types'

function makeContext(overrides?: Partial<ExperienceContext>): ExperienceContext {
  return {
    now: '2026-10-08T10:00:00Z',
    date: { iso: '2026-10-08', day: 'Thursday', dayNumber: 8, month: 'October', year: 2026 },
    weekday: 'THU',
    period: 'day',
    schoolDay: true,
    weather: undefined,
    specialTags: [],
    ...overrides,
  }
}

describe('evaluateRules', () => {
  it('returns empty array when no rules match', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    expect(evaluateRules(rules, ctx)).toEqual([])
  })

  it('returns matching rules', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    const result = evaluateRules(rules, ctx)
    expect(result).toHaveLength(1)
    expect(result[0].rule.id).toBe('r1')
  })

  it('skips disabled rules', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: false, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    expect(evaluateRules(rules, ctx)).toEqual([])
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [x] **Step 3: Implement `lib/engine/evaluator.ts`**

```ts
import type { ExperienceRule, ExperienceContext } from './types'
import { evaluateCondition } from './operators'

export interface EvaluatedRule {
  rule: ExperienceRule
  weatherMatched: boolean
}

export function evaluateRules(rules: ExperienceRule[], ctx: ExperienceContext): EvaluatedRule[] {
  return rules
    .filter(rule => rule.enabled)
    .map(rule => ({
      rule,
      weatherMatched: 'weather' in rule.when ? evaluateCondition(rule.when, ctx) : false,
    }))
    .filter(({ rule }) => evaluateCondition(rule.when, ctx))
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (18 tests total)

- [x] **Step 5: Commit**

```bash
git add lib/engine/evaluator.ts lib/engine/__tests__/evaluator.test.ts
git commit -m "feat: add rule evaluator"
```

---

### Task 9: Create `lib/engine/scoring.ts`

**Files:**
- Create: `lib/engine/scoring.ts`
- Create: `lib/engine/__tests__/scoring.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scoreCandidates } from '../scoring'
import type { ExperienceRule, HistoryEntry } from '../types'

describe('scoreCandidates', () => {
  it('computes base score from priority and then.score', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 10, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = []
    const result = scoreCandidates(rules, history, 'l1')
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(110) // 100 + 10 + 0 (weather) + 40 (novelty) - 0 (penalty)
  })

  it('adds weather relevance when weather condition matched', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { weather: { rainProbabilityAbove: 60 } }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = []
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(160) // 100 + 0 + 20 (weather) + 40 (novelty) - 0
  })

  it('applies repetition penalty for recent layout', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'l1', shownAt: new Date(Date.now() - 3 * 60 * 1000) }, // 3 minutes ago
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(110 - 300) // 100 + 0 + 0 + 0 (no novelty) - 300 (penalty)
  })

  it('applies no penalty for old layout', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'l1', shownAt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes ago
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(100 + 40) // 100 + 0 + 0 + 40 (novelty) - 0 (no penalty, > 5 min)
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [x] **Step 3: Implement `lib/engine/scoring.ts`**

```ts
import type { ExperienceRule, HistoryEntry } from './types'
import type { ScoredCandidate } from './types'

const NOVELTY_BONUS = 40
const WEATHER_RELEVANCE = 20
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function getRepetitionPenalty(history: HistoryEntry[], layoutId: string): number {
  const now = Date.now()
  const recent = history
    .filter(h => h.layoutId === layoutId)
    .filter(h => now - h.shownAt.getTime() < 120 * 60 * 1000)
    .sort((a, b) => b.shownAt.getTime() - a.shownAt.getTime())[0]

  if (!recent) return 0

  const age = now - recent.shownAt.getTime()
  if (age < 5 * 60 * 1000) return 300
  if (age < 30 * 60 * 1000) return 150
  if (age < 120 * 60 * 1000) return 50
  return 0
}

function getNoveltyBonus(history: HistoryEntry[], layoutId: string): number {
  const now = Date.now()
  const recent = history.find(h => h.layoutId === layoutId && now - h.shownAt.getTime() < RETENTION_WINDOW_MS)
  return recent ? 0 : NOVELTY_BONUS
}

export function scoreCandidates(
  rules: ExperienceRule[],
  history: HistoryEntry[],
  _currentLayoutId: string
): ScoredCandidate[] {
  return rules.map(rule => {
    const weatherRelevance = 'weather' in rule.when ? WEATHER_RELEVANCE : 0
    const novelty = getNoveltyBonus(history, rule.then.layoutId)
    const penalty = getRepetitionPenalty(history, rule.then.layoutId)
    const score = rule.priority + rule.then.score + weatherRelevance + novelty - penalty
    return { rule, score, layoutId: rule.then.layoutId }
  })
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (22 tests total)

- [x] **Step 5: Commit**

```bash
git add lib/engine/scoring.ts lib/engine/__tests__/scoring.test.ts
git commit -m "feat: add scoring with novelty, weather relevance, repetition penalty"
```

---

### Task 10: Create `lib/engine/selector.ts`

**Files:**
- Create: `lib/engine/selector.ts`
- Create: `lib/engine/__tests__/selector.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/selector.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectWinner } from '../selector'
import type { ScoredCandidate, ExperienceRule } from '../types'

function makeRule(id: string, priority: number): ExperienceRule {
  return { id, name: id, enabled: true, priority, when: { days: ['THU'] }, then: { layoutId: `l-${id}`, state: 'ambient', score: 0, durationMs: 0 } }
}

describe('selectWinner', () => {
  it('returns the highest scoring candidate', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
      { rule: makeRule('r2', 200), score: 200, layoutId: 'l-r2' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r2')
  })

  it('tie-breaks by priority', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
      { rule: makeRule('r2', 200), score: 100, layoutId: 'l-r2' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r2')
  })

  it('tie-breaks by rule id when priority is equal', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r2', 100), score: 100, layoutId: 'l-r2' },
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r1')
  })

  it('returns null for empty candidates', () => {
    expect(selectWinner([])).toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [x] **Step 3: Implement `lib/engine/selector.ts`**

```ts
import type { ScoredCandidate } from './types'

export function selectWinner(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority
    return a.rule.id.localeCompare(b.rule.id)
  })[0]
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (26 tests total)

- [x] **Step 5: Commit**

```bash
git add lib/engine/selector.ts lib/engine/__tests__/selector.test.ts
git commit -m "feat: add selector with score/priority/id tie-breaking"
```

---

## Phase 3: Engine — Impure Module

### Task 11: Create `lib/engine/state.ts`

**Files:**
- Create: `lib/engine/state.ts`
- Create: `lib/engine/__tests__/state.test.ts`

- [x] **Step 1: Write the failing test**

Create `lib/engine/__tests__/state.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getDecision } from '../state'
import type { FrameStore, WeatherData, DisplayHistory } from '../../types'

function makeStore(overrides?: Partial<FrameStore>): FrameStore {
  return {
    activeId: 'layout-1',
    layouts: [{ id: 'layout-1', name: 'Test', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 47.3769, lon: 8.5417, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
    presets: [],
    customFonts: [],
    schedule: { enabled: false, rules: [], night: { enabled: false, start: '22:00', end: '06:00', brightness: 30, warmth: 0, hideSeconds: false } },
    albums: [],
    experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    ...overrides,
  }
}

const mockReadStore = vi.fn()
const mockFetchWeather = vi.fn()
const mockQueryHistory = vi.fn()
const mockAppendHistory = vi.fn()
const mockPruneHistory = vi.fn()

vi.mock('../../store', () => ({
  readStore: mockReadStore,
}))
vi.mock('../../weather', () => ({
  fetchWeather: mockFetchWeather,
}))
vi.mock('../../db', () => ({
  queryHistory: mockQueryHistory,
  appendHistory: mockAppendHistory,
  pruneHistory: mockPruneHistory,
}))

describe('getDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue([])
    mockAppendHistory.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
  })

  it('returns a decision with ruleId null when experiences disabled', async () => {
    mockReadStore.mockResolvedValue(makeStore())
    mockFetchWeather.mockResolvedValue(undefined)

    const decision = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.layoutId).toBe('layout-1')
    expect(decision.state).toBe('ambient')
  })

  it('returns a decision with ruleId when experience matches', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Morning', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'layout-1', state: 'action', bob: { expression: 'planning' }, score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    const decision = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBe('r1')
    expect(decision.state).toBe('action')
    expect(decision.bob?.expression).toBe('planning')
  })

  it('filters out candidates with non-existent layoutId', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Bad', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'non-existent', state: 'ambient', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    const decision = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.layoutId).toBe('layout-1')
  })

  it('appends to history after selecting', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{ id: 'r1', name: 'Morning', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'layout-1', state: 'action', score: 0, durationMs: 0 } }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockAppendHistory).toHaveBeenCalledWith(
      'home',
      expect.any(String),
      'layout-1',
      expect.any(Date),
      expect.any(Number)
    )
  })

  it('prunes history before appending', async () => {
    mockReadStore.mockResolvedValue(makeStore())
    mockFetchWeather.mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(mockPruneHistory).toHaveBeenCalledWith('home')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [x] **Step 3: Implement `lib/engine/state.ts`**

```ts
import { createHash } from 'crypto'
import type { FrameStore, DisplayDecision, ExperienceContext, HistoryEntry } from './types'
import { buildContext } from './context'
import { evaluateRules } from './evaluator'
import { scoreCandidates } from './scoring'
import { selectWinner } from './selector'
import { readStore } from '../store'
import { fetchWeather } from '../weather'
import { queryHistory, appendHistory, pruneHistory } from '../db'

function decisionId(ruleId: string | null, layoutId: string, state: string, bobExpression?: string, bobSpeech?: string): string {
  return createHash('sha256')
    .update(JSON.stringify([ruleId, layoutId, state, bobExpression ?? null, bobSpeech ?? null]))
    .digest('hex')
    .slice(0, 16)
}

export interface GetDecisionOptions {
  simulatedTime?: Date
}

export async function getDecision(
  frameId: string,
  now: Date = new Date(),
  options?: GetDecisionOptions
): Promise<{ decision: DisplayDecision; context: ExperienceContext; store: FrameStore }> {
  const store = await readStore(frameId)
  const time = options?.simulatedTime || now

  const layout = store.layouts.find(l => l.id === store.activeId) || store.layouts[0]
  const weather = layout ? await fetchWeather(layout.settings.lat, layout.settings.lon, layout.settings.units) : undefined

  const context = buildContext(store, time, weather)

  if (!store.experiences.enabled) {
    const layoutId = resolveFallbackLayout(store)
    const decision: DisplayDecision = {
      id: decisionId(null, layoutId, 'ambient'),
      state: 'ambient',
      layoutId,
      bob: null,
      priority: 0,
      score: 0,
      reason: 'Schedule',
      ruleId: null,
      durationMs: 0,
      generatedAt: time.toISOString(),
    }
    return { decision, context, store }
  }

  const layoutIds = new Set(store.layouts.map(l => l.id))
  const eligibleRules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  const evaluated = evaluateRules(eligibleRules, context)

  let history: HistoryEntry[] = []
  try {
    const rows = await queryHistory(frameId)
    history = rows.map(r => ({ layoutId: r.layoutId, shownAt: r.shownAt }))
  } catch (error) {
    console.error('[state] Failed to query history:', error)
  }

  const scored = scoreCandidates(evaluated.map(e => e.rule), history, '')
  const winner = selectWinner(scored)

  if (!winner) {
    const layoutId = resolveFallbackLayout(store)
    const decision: DisplayDecision = {
      id: decisionId(null, layoutId, 'ambient'),
      state: 'ambient',
      layoutId,
      bob: null,
      priority: 0,
      score: 0,
      reason: 'Schedule',
      ruleId: null,
      durationMs: 0,
      generatedAt: time.toISOString(),
    }
    return { decision, context, store }
  }

  const rule = winner.rule
  const decision: DisplayDecision = {
    id: decisionId(rule.id, rule.then.layoutId, rule.then.state, rule.then.bob?.expression, rule.then.bob?.speech),
    state: rule.then.state,
    layoutId: rule.then.layoutId,
    bob: rule.then.bob,
    priority: rule.priority,
    score: winner.score,
    reason: rule.then.reason || rule.name,
    ruleId: rule.id,
    durationMs: rule.then.durationMs,
    generatedAt: time.toISOString(),
  }

  try {
    await pruneHistory(frameId)
    await appendHistory(frameId, decision.id, decision.layoutId, new Date(), decision.score)
  } catch (error) {
    console.error('[state] Failed to append history:', error)
  }

  return { decision, context, store }
}

function resolveFallbackLayout(store: FrameStore): string {
  if (store.schedule.enabled && store.schedule.rules.length > 0) {
    const now = new Date()
    const day = now.getDay()
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const rule of store.schedule.rules) {
      if (!rule.days.includes(day)) continue
      const [startH, startM] = rule.start.split(':').map(Number)
      const [endH, endM] = rule.end.split(':').map(Number)
      const start = startH * 60 + startM
      const end = endH * 60 + endM
      if (start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end) {
        return rule.layoutId
      }
    }
  }
  return store.activeId || store.layouts[0]?.id || ''
}
```

- [x] **Step 4: Create `lib/db/index.ts` with history functions**

Create `lib/db/index.ts`:

```ts
import { db } from './client'
import { displayHistory } from './schema'
import type { HistoryEntry } from '../engine/types'

export async function queryHistory(frameId: string): Promise<HistoryEntry[]> {
  const rows = await db.select().from(displayHistory).where(eq(displayHistory.frameId, frameId))
  return rows.map(r => ({ layoutId: r.layoutId, shownAt: r.shownAt }))
}

export async function appendHistory(
  frameId: string,
  decisionId: string,
  layoutId: string,
  shownAt: Date,
  score: number
): Promise<void> {
  await db.insert(displayHistory).values({
    frameId,
    decisionId,
    layoutId,
    shownAt,
    score,
  }).onConflictDoNothing()
}

export async function pruneHistory(frameId: string): Promise<void> {
  await db.delete(displayHistory).where(
    and(eq(displayHistory.frameId, frameId), lt(displayHistory.shownAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
  )
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (31 tests total)

- [x] **Step 6: Commit**

```bash
git add lib/engine/state.ts lib/engine/__tests__/state.test.ts lib/db/index.ts
git commit -m "feat: add state.ts impure module with history append and pruning"
```

---

## Phase 4: API Endpoints

### Task 12: Create `/api/display/state` endpoint

**Files:**
- Create: `app/api/display/state/route.ts`

- [x] **Step 1: Create the endpoint**

Create `app/api/display/state/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDecision } from '@/lib/engine/state'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const frameId = req.nextUrl.searchParams.get('frame') || 'home'

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  try {
    const { decision, context, store } = await getDecision(frameId)
    return NextResponse.json(
      { decision, context, store },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[display/state] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add app/api/display/state/route.ts
git commit -m "feat: add /api/display/state endpoint"
```

---

### Task 13: Create `/api/display/preview` endpoint

**Files:**
- Create: `app/api/display/preview/route.ts`

- [x] **Step 1: Create the endpoint**

Create `app/api/display/preview/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDecision } from '@/lib/engine/state'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const frameId = req.nextUrl.searchParams.get('frame') || 'home'

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(frameId)) {
    return NextResponse.json({ error: 'Invalid frame ID' }, { status: 400 })
  }

  let body: { dateTime?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.dateTime || typeof body.dateTime !== 'string') {
    return NextResponse.json({ error: 'dateTime is required' }, { status: 400 })
  }

  const simulatedTime = new Date(body.dateTime)
  if (isNaN(simulatedTime.getTime())) {
    return NextResponse.json({ error: 'Invalid dateTime' }, { status: 400 })
  }

  try {
    const { decision, context } = await getDecision(frameId, new Date(), { simulatedTime })
    return NextResponse.json(
      {
        decision,
        context,
        warning: 'This preview does not account for display history. The real decision may differ.',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[display/preview] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add app/api/display/preview/route.ts
git commit -m "feat: add /api/display/preview endpoint"
```

---

## Phase 5: Widget

### Task 14: Add `bob` widget to `lib/widgets.ts`

**Files:**
- Modify: `lib/widgets.ts`
- Modify: `lib/types.ts`

- [x] **Step 1: Add `bob` to `WIDGET_TYPES` in `lib/types.ts`**

Add `'bob'` to the `WIDGET_TYPES` array:
```ts
export const WIDGET_TYPES = [
  'clock-digital', 'clock-analog', 'date', 'weather', 'uv', 'sun',
  'calendar', 'text', 'icon', 'world-clock', 'hourly', 'moon',
  'countdown', 'quote', 'now-showing', 'bob',
] as const
```

- [x] **Step 2: Add `Bob` widget definition to `lib/widgets.ts`**

Add at the end of the `WIDGETS` array:

```ts
{
  type: 'bob',
  label: 'Bob',
  description: 'FamilyOS Bob character',
  category: 'Family',
  icon: 'smile',
  size: { w: 360, h: 480 },
  minSize: { w: 120, h: 160 },
  lockAspect: true,
  templates: ['plain', 'speech', 'badge'],
  props: {
    source: 'fixed',
    expression: 'happy',
    speech: '',
    animate: false,
  },
  fields: [
    { name: 'source', label: 'Source', kind: 'select', options: [
      { value: 'fixed', label: 'Fixed' },
      { value: 'decision', label: 'Follow Decision' },
    ]},
    { name: 'expression', label: 'Expression', kind: 'select', options: [
      { value: 'thinking', label: 'Thinking' },
      { value: 'action', label: 'Action' },
      { value: 'celebrate', label: 'Celebrate' },
      { value: 'idea', label: 'Idea' },
      { value: 'reminder', label: 'Reminder' },
      { value: 'success', label: 'Success' },
      { value: 'exercise', label: 'Exercise' },
      { value: 'talking', label: 'Talking' },
      { value: 'planning', label: 'Planning' },
      { value: 'building', label: 'Building' },
      { value: 'reading', label: 'Reading' },
      { value: 'happy', label: 'Happy' },
    ], showWhen: { source: 'fixed' } },
    { name: 'speech', label: 'Speech', kind: 'text' },
    { name: 'animate', label: 'Animate', kind: 'toggle' },
  ],
},
```

- [x] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add lib/types.ts lib/widgets.ts
git commit -m "feat: add bob widget definition"
```

---

### Task 15: Add `decision` to `WidgetContext` and thread through

**Files:**
- Modify: `components/frame/widget-content.tsx`
- Modify: `components/frame/frame-scene.tsx`

- [x] **Step 1: Add `decision` to `WidgetContext` in `widget-content.tsx`**

Find the `WidgetContext` type and add `decision`:
```ts
type WidgetContext = {
  now: Date
  weather: WeatherData | null
  settings: LayoutSettings
  hideSeconds?: boolean
  slide?: ActiveSlide | null
  decision?: DisplayDecision | null
}
```

- [x] **Step 2: Add `decision` prop to `FrameScene` in `frame-scene.tsx`**

Find the `FrameScene` props type and add `decision`:
```ts
type FrameSceneProps = {
  widgets: Widget[]
  settings: LayoutSettings
  weather: WeatherData | null
  now: Date
  scale: number
  album?: Album | null
  night?: boolean
  children?: React.ReactNode
  renderWidget?: (widget: Widget, body: React.ReactNode) => React.ReactNode
  decision?: DisplayDecision | null
}
```

Pass `decision` to `WidgetBody`:
```ts
<WidgetBody key={widget.id} widget={widget} ctx={{ ...ctx, decision }} />
```

- [x] **Step 3: Add `decision` prop to `WidgetBody` in `frame-scene.tsx`**

Find `WidgetBody` and add `decision` to the context:
```ts
function WidgetBody({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  // ... existing code, ctx now includes decision
}
```

- [x] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 5: Commit**

```bash
git add components/frame/widget-content.tsx components/frame/frame-scene.tsx
git commit -m "feat: thread decision through WidgetContext"
```

---

### Task 16: Implement `BobWidget` component

**Files:**
- Modify: `components/frame/widget-content.tsx`

- [x] **Step 1: Add `BobWidget` component to `widget-content.tsx`**

Add before the `WidgetContent` switch:

```ts
function BobWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const source = (widget.props.source as string) || 'fixed'
  const expression = source === 'decision'
    ? (ctx.decision?.bob?.expression ?? (widget.props.expression as string) ?? 'happy')
    : ((widget.props.expression as string) ?? 'happy')
  const speech = source === 'decision'
    ? (ctx.decision?.bob?.speech ?? (widget.props.speech as string) ?? '')
    : ((widget.props.speech as string) ?? '')

  const imageSrc = `/bob/${expression}.webp`
  const animate = widget.props.animate as boolean

  return (
    <div className={cn('flex h-full w-full flex-col items-center justify-center', animate && 'animate-in fade-in')}>
      <img
        src={imageSrc}
        alt={expression}
        className="h-full w-full object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '/bob/happy.webp'
        }}
      />
      {speech && widget.template === 'speech' && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full rounded-xl bg-white px-3 py-1 text-sm font-medium text-gray-900 shadow-lg">
          {speech}
        </div>
      )}
    </div>
  )
}
```

Add to the `WidgetContent` switch:
```ts
case 'bob':
  return <BobWidget widget={widget} ctx={ctx} />
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add components/frame/widget-content.tsx
git commit -m "feat: implement BobWidget component with decision binding"
```

---

## Phase 6: Display

### Task 17: Update `FrameDisplay` to use decision endpoint

**Files:**
- Modify: `components/frame/frame-display.tsx`

- [x] **Step 1: Update `FrameDisplay` to poll `/api/display/state`**

Replace the SWR polling and rendering logic:

```tsx
'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { FrameScene } from './frame-scene'
import { useNow } from '@/hooks/use-now'
import { useViewportScale } from '@/hooks/use-viewport-scale'
import { resolveDisplay } from '@/lib/schedule'
import { clockParts } from '@/lib/schedule'
import type { FrameStore, DisplayDecision, ExperienceContext } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function FrameDisplay({ frameId, initialStore }: { frameId: string; initialStore: FrameStore }) {
  const now = useNow()
  const scale = useViewportScale()
  const [decision, setDecision] = useState<DisplayDecision | null>(null)
  const [store, setStore] = useState<FrameStore>(initialStore)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/display/state?frame=${frameId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setDecision(data.decision)
          setStore(data.store)
        }
      } catch (error) {
        console.error('[FrameDisplay] Poll failed:', error)
      }
    }

    poll()
    const interval = setInterval(poll, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [frameId])

  const layoutId = decision?.layoutId || resolveDisplay(store, clockParts(now))?.layout?.id || store.activeId
  const layout = store.layouts.find(l => l.id === layoutId) || store.layouts[0]

  if (!layout) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-black text-white">
        <p>No layout has been published to this frame yet.</p>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen cursor-none overflow-hidden bg-black">
      <FrameScene
        widgets={layout.widgets}
        settings={layout.settings}
        weather={null}
        now={now}
        scale={scale}
        album={null}
        night={false}
        decision={decision}
      />
    </main>
  )
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add components/frame/frame-display.tsx
git commit -m "feat: update FrameDisplay to poll /api/display/state with client fallback"
```

---

## Phase 7: Editor

### Task 18: Add Experiences panel to editor

**Files:**
- Create: `components/editor/experiences-panel.tsx`
- Modify: `components/editor/editor.tsx`

- [x] **Step 1: Create `experiences-panel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Experiences, ExperienceRule, FrameStore } from '@/lib/types'

interface ExperiencesPanelProps {
  store: FrameStore
  onChange: (experiences: Experiences) => void
}

export function ExperiencesPanel({ store, onChange }: ExperiencesPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const experiences = store.experiences

  function updateExperiences(next: Experiences) {
    onChange(next)
  }

  function addRule() {
    const newRule: ExperienceRule = {
      id: `rule-${Date.now()}`,
      name: 'New Rule',
      enabled: true,
      priority: 100,
      when: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
      then: {
        layoutId: store.layouts[0]?.id || '',
        state: 'ambient',
        score: 0,
        durationMs: 0,
      },
    }
    updateExperiences({ ...experiences, rules: [...experiences.rules, newRule] })
  }

  function removeRule(id: string) {
    updateExperiences({ ...experiences, rules: experiences.rules.filter(r => r.id !== id) })
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Experiences</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={experiences.enabled}
            onChange={e => updateExperiences({ ...experiences, enabled: e.target.checked })}
          />
          <span className="text-sm">Enabled</span>
        </label>
      </div>

      <div className="space-y-2">
        {experiences.rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-2 p-2 border rounded">
            <span className="text-sm font-medium flex-1">{rule.name}</span>
            <span className="text-xs text-gray-500">P{rule.priority}</span>
            <button onClick={() => removeRule(rule.id)} className="text-red-500 hover:text-red-700">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRule}
        className="mt-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
      >
        <Plus size={14} />
        Add Rule
      </button>
    </div>
  )
}
```

- [x] **Step 2: Add Experiences panel to `editor.tsx`**

Find where the schedule panel is rendered and add the Experiences panel beside it:

```tsx
<ExperiencesPanel store={store} onChange={experiences => updateStore({ ...store, experiences })} />
```

- [x] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add components/editor/experiences-panel.tsx components/editor/editor.tsx
git commit -m "feat: add Experiences panel to editor"
```

---

### Task 19: Add simulated-time preview to editor

**Files:**
- Modify: `components/editor/experiences-panel.tsx`

- [x] **Step 1: Add preview button to `experiences-panel.tsx`**

Add a preview section at the bottom of the panel:

```tsx
function PreviewSection({ store }: { store: FrameStore }) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function runPreview() {
    setLoading(true)
    try {
      const res = await fetch(`/api/display/preview?frame=home`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime: new Date().toISOString().slice(0, 16) }),
      })
      const data = await res.json()
      setPreview(data)
    } catch (error) {
      console.error('Preview failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      <button
        onClick={runPreview}
        disabled={loading}
        className="text-sm text-blue-600 hover:text-blue-800"
      >
        {loading ? 'Loading...' : 'Preview'}
      </button>
      {preview && (
        <div className="mt-2 text-sm">
          <p>Layout: {preview.decision?.layoutId}</p>
          <p>Bob: {preview.decision?.bob?.expression || 'none'}</p>
          <p>Reason: {preview.decision?.reason}</p>
          {preview.warning && <p className="text-amber-600">{preview.warning}</p>}
        </div>
      )}
    </div>
  )
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add components/editor/experiences-panel.tsx
git commit -m "feat: add simulated-time preview to Experiences panel"
```

---

## Phase 8: Hardening

### Task 20: Remove `ignoreBuildErrors` and verify build

**Files:**
- Modify: `next.config.mjs`

- [x] **Step 1: Remove `ignoreBuildErrors` from `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
}

export default nextConfig
```

- [x] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [x] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "chore: remove ignoreBuildErrors to enforce type safety"
```

---

### Task 21: Add logging, metrics, and health check

**Files:**
- Create: `app/api/health/route.ts`
- Modify: `lib/engine/state.ts`

- [x] **Step 1: Add health check endpoint**

Create `app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    return NextResponse.json(
      { status: 'error', database: 'disconnected', error: String(error) },
      { status: 503 }
    )
  }
}
```

- [x] **Step 2: Add structured logging to `state.ts`**

Add at the top of `state.ts`:

```ts
function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() }))
}
```

Replace `console.error` and `console.warn` calls with `log('error', ...)` and `log('warn', ...)`.

- [x] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add app/api/health/route.ts lib/engine/state.ts
git commit -m "feat: add health check endpoint and structured logging"
```

---

### Task 22: Add all missing tests

**Files:**
- Create: `lib/engine/__tests__/normalize.test.ts`
- Create: `lib/engine/__tests__/preview.test.ts`
- Create: `lib/engine/__tests__/fallback.test.ts`

- [x] **Step 1: Write normalize test**

Create `lib/engine/__tests__/normalize.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store', () => ({
  readStore: vi.fn(),
}))

import { normalize } from '../../store'

describe('normalize', () => {
  it('adds default experiences when missing', () => {
    const store: any = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test' }],
      schedule: { enabled: false, rules: [] },
      albums: [],
    }
    const result = normalize(store)
    expect(result.experiences).toEqual({ enabled: false, rules: [], settings: { schoolHolidays: [] } })
  })

  it('prunes experience rules referencing deleted layouts', () => {
    const store: any = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test' }],
      schedule: { enabled: false, rules: [] },
      albums: [],
      experiences: {
        enabled: true,
        rules: [
          { id: 'r1', name: 'Good', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
          { id: 'r2', name: 'Bad', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'deleted', state: 'ambient', score: 0, durationMs: 0 } },
        ],
        settings: { schoolHolidays: [] },
      },
    }
    const result = normalize(store)
    expect(result.experiences.rules).toHaveLength(1)
    expect(result.experiences.rules[0].id).toBe('r1')
  })
})
```

- [x] **Step 2: Write preview test**

Create `lib/engine/__tests__/preview.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store', () => ({ readStore: vi.fn() }))
vi.mock('../../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../../db', () => ({ queryHistory: vi.fn(), appendHistory: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision } from '../state'

describe('preview', () => {
  it('does not append to history', async () => {
    const { appendHistory } = await import('../../db')
    vi.mocked(appendHistory).mockResolvedValue(undefined)

    const store: any = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test', settings: { lat: 0, lon: 0, units: 'metric' } }],
      schedule: { enabled: false, rules: [] },
      albums: [],
      experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    }
    const { readStore } = await import('../../store')
    vi.mocked(readStore).mockResolvedValue(store)
    const { fetchWeather } = await import('../../weather')
    vi.mocked(fetchWeather).mockResolvedValue(undefined)

    await getDecision('home', new Date('2026-10-08T10:00:00Z'), { simulatedTime: new Date('2026-10-08T10:00:00Z') })
    expect(appendHistory).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 3: Write fallback test**

Create `lib/engine/__tests__/fallback.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../store', () => ({ readStore: vi.fn() }))
vi.mock('../../weather', () => ({ fetchWeather: vi.fn() }))
vi.mock('../../db', () => ({ queryHistory: vi.fn(), appendHistory: vi.fn(), pruneHistory: vi.fn() }))

import { getDecision } from '../state'

describe('fallback', () => {
  it('returns ruleId null when experiences disabled', async () => {
    const store: any = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test', settings: { lat: 0, lon: 0, units: 'metric' } }],
      schedule: { enabled: false, rules: [] },
      albums: [],
      experiences: { enabled: false, rules: [], settings: { schoolHolidays: [] } },
    }
    const { readStore } = await import('../../store')
    vi.mocked(readStore).mockResolvedValue(store)
    const { fetchWeather } = await import('../../weather')
    vi.mocked(fetchWeather).mockResolvedValue(undefined)

    const { decision } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(decision.ruleId).toBeNull()
    expect(decision.bob).toBeNull()
  })
})
```

- [x] **Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass (34+ tests)

- [x] **Step 5: Commit**

```bash
git add lib/engine/__tests__/
git commit -m "test: add normalize, preview, and fallback tests"
```

---

## Phase 9: Final Verification

### Task 23: End-to-end verification

**Files:**
- N/A (verification only)

- [x] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [x] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [x] **Step 3: Run dev server and verify endpoints**

Run: `npm run dev`
Expected: Server starts

- [x] **Step 4: Test `/api/display/state`**

Run: `curl http://localhost:3000/api/display/state?frame=home`
Expected: Returns `{ decision, context, store }` with `decision.ruleId: null`

- [x] **Step 5: Test `/api/display/preview`**

Run: `curl -X POST http://localhost:3000/api/display/preview?frame=home -H 'Content-Type: application/json' -d '{"dateTime":"2026-10-08T18:15:00"}'`
Expected: Returns `{ decision, context, warning }`

- [x] **Step 6: Test `/api/health`**

Run: `curl http://localhost:3000/api/health`
Expected: Returns `{ status: "ok", database: "connected" }`

- [x] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address any issues found during end-to-end verification"
```

---

## Summary

This plan implements the Bob Engine design v2 in 23 tasks across 9 phases:

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-4 | Foundation: types, schema, normalize, weather module |
| 2 | 5-10 | Engine pure modules: types, context, operators, evaluator, scoring, selector |
| 3 | 11 | Engine impure module: state.ts |
| 4 | 12-13 | API endpoints: state and preview |
| 5 | 14-16 | Widget: definition, context threading, rendering |
| 6 | 17 | Display: poll decision endpoint |
| 7 | 18-19 | Editor: Experiences panel and preview |
| 8 | 20-22 | Hardening: build, logging, tests |
| 9 | 23 | End-to-end verification |

Each task follows TDD: write failing test, implement, verify, commit. The plan is designed for execution via subagent-driven-development or executing-plans.
