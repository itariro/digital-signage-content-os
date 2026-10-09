# Bob Editor & Preview Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fresh frame look intentional (curated layouts + seeded rules), stop the Experiences panel hammering the API and losing conditions, and make the simulated-time preview correct and actually selectable — including rendering the decision's Bob in the editor preview.

**Architecture:** Seeding stays in `lib/store.ts` (it owns `DEFAULT_SETTINGS` and the `w()` widget helper, so no circular import). Panel state logic that is worth testing is extracted into pure helpers under `lib/`, leaving the React component thin. Preview timezone conversion becomes a pure, tested helper used by the engine orchestrator.

**Tech Stack:** TypeScript strict, Next.js 16, React 19, Zod, Vitest.

**Findings covered:** F-08 (curated content), F-11 (per-keystroke writes), F-12 (stale draft / lost conditions), F-13 (preview timezone + picker), F-17 (decision in editor preview).

**Depends on:** The correctness plan (`2026-10-09-bob-engine-correctness.md`) for `durationMs`, `HistorySummary`, and the `ruleId` column. If executing this plan first, the seed rules may set `durationMs: 0` safely.

---

## File Structure

**Create:**
- `lib/experience-draft.ts` — pure helpers: `mergeDaysCondition`, `toggleWeekday`.
- `lib/__tests__/experience-draft.test.ts`.
- `lib/zoned-time.ts` — `parseZonedWallTime`, `formatLocalInputValue`.
- `lib/__tests__/zoned-time.test.ts`.
- `lib/__tests__/seed.test.ts`.

**Modify:**
- `lib/store.ts` — export `seed`, add curated layouts + default rules.
- `components/editor/experiences-panel.tsx` — debounce, draft sync, composite preservation, time picker.
- `components/editor/preview-overlay.tsx` — accept and pass `decision`.
- `components/editor/editor.tsx` — fetch preview decision, pass to overlay.
- `app/api/display/preview/route.ts` — validate and forward the naive wall time.
- `lib/engine/state.ts` — accept `simulatedWallTime` and parse it in the frame zone.

---

### Task 1: Seed curated layouts and default rules

**Files:**
- Modify: `lib/store.ts`
- Create: `lib/__tests__/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seed, normalize } from '../store'

const CURATED = ['Morning', 'Today', 'Gallery', 'Welcome Home', 'Evening', 'Weekend', 'Weather', 'Night']

describe('seed', () => {
  it('seeds the curated layouts', () => {
    const store = seed()
    const names = store.layouts.map(l => l.name)
    for (const name of CURATED) expect(names).toContain(name)
  })

  it('enables the engine with default rules that all resolve to real layouts', () => {
    const store = seed()
    expect(store.experiences.enabled).toBe(true)
    expect(store.experiences.rules.length).toBeGreaterThanOrEqual(7)
    const layoutIds = new Set(store.layouts.map(l => l.id))
    for (const rule of store.experiences.rules) {
      expect(layoutIds.has(rule.then.layoutId)).toBe(true)
    }
  })

  it('keeps a fresh normalize default disabled for pre-existing frames', () => {
    const legacy = { activeId: 'l1', layouts: [{ id: 'l1', name: 'L' }], schedule: { enabled: false, rules: [] }, albums: [] } as any
    expect(normalize(legacy).experiences.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/seed.test.ts`
Expected: FAIL — `seed` is not exported and curated layouts do not exist.

- [ ] **Step 3: Add curated builders and rules to `lib/store.ts`**

Add `ExperienceRule` to the type import at the top:

```ts
import type { Album, ExperienceRule, FrameStore, Layout, LayoutSettings, Widget } from './types'
```

Add these helpers above `seed()` (after `seedPhotoAlbum`):

```ts
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const

function curatedLayout(name: string, background: string, dim: number, widgets: Widget[], albumId: string | null = null): Layout {
  const now = new Date().toISOString()
  return {
    id: nanoid(10),
    name,
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, background, dim, albumId },
    widgets,
  }
}

/** The eight curated layouts from spec §7, composed from the existing widget set. */
function curatedLayouts(albumId: string): Layout[] {
  return [
    curatedLayout('Morning', '/backgrounds/alpine-lake.png', 20, [
      w('date', 140, 200, 800, 70, { template: 'long' }),
      w('weather', 140, 320, 560, 200, { template: 'compact' }),
      w('text', 140, 560, 800, 120, { template: 'plain', props: { text: 'Good morning' } }),
      w('bob', 360, 780, 360, 480, { props: { source: 'decision', expression: 'planning' } }),
    ]),
    curatedLayout('Today', '/backgrounds/alpine-lake.png', 25, [
      w('date', 140, 160, 800, 80, { template: 'long' }),
      w('calendar', 140, 300, 800, 560, { template: 'week' }),
      w('weather', 140, 920, 480, 200, { template: 'compact' }),
      w('bob', 620, 900, 320, 420, { props: { source: 'decision', expression: 'planning' } }),
    ]),
    curatedLayout('Gallery', '/backgrounds/city-night.png', 30, [
      w('now-showing', 120, 1560, 840, 220, { template: 'card' }),
      w('date', 120, 140, 500, 60, { template: 'compact' }),
      w('weather', 660, 140, 300, 120, { template: 'compact', props: { showLocation: false } }),
    ], albumId),
    curatedLayout('Welcome Home', '/backgrounds/coastal-cliffs.png', 25, [
      w('text', 140, 300, 800, 160, { template: 'caption', props: { text: 'Welcome home' } }),
      w('weather', 140, 520, 560, 200, { template: 'compact' }),
      w('bob', 360, 820, 360, 480, { props: { source: 'decision', expression: 'happy' } }),
    ]),
    curatedLayout('Evening', '/backgrounds/desert-dunes.png', 35, [
      w('clock-digital', 140, 200, 800, 220, { template: 'classic' }),
      w('date', 140, 460, 800, 70, { template: 'long' }),
      w('quote', 140, 620, 800, 240, { template: 'serif' }),
      w('bob', 360, 940, 360, 480, { props: { source: 'decision', expression: 'talking' } }),
    ]),
    curatedLayout('Weekend', '/backgrounds/coastal-cliffs.png', 30, [
      w('countdown', 140, 200, 800, 220, { template: 'ring' }),
      w('quote', 140, 500, 800, 240, { template: 'marks' }),
      w('bob', 360, 820, 360, 480, { props: { source: 'decision', expression: 'celebrate' } }),
    ], albumId),
    curatedLayout('Weather', '/backgrounds/alpine-lake.png', 20, [
      w('weather', 140, 200, 800, 300, { template: 'detailed' }),
      w('uv', 140, 560, 360, 260, { template: 'bar' }),
      w('sun', 540, 560, 400, 260, { template: 'arc' }),
      w('bob', 360, 900, 360, 480, { props: { source: 'decision', expression: 'reminder' } }),
    ]),
    curatedLayout('Night', '/backgrounds/city-night.png', 55, [
      w('clock-digital', 140, 700, 800, 220, { template: 'classic' }),
      w('date', 140, 960, 800, 70, { template: 'compact' }),
    ]),
  ]
}

/** Default rules from spec §4.5, wired to the curated layout ids. */
function defaultExperienceRules(layouts: Layout[]): ExperienceRule[] {
  const byName = new Map(layouts.map(l => [l.name, l.id]))
  const id = (name: string) => byName.get(name) ?? layouts[0].id
  return [
    { id: nanoid(8), name: 'Morning', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '06:00', to: '08:45' } }] }, then: { layoutId: id('Morning'), state: 'action', bob: { expression: 'planning' }, score: 0, durationMs: 0, reason: 'Morning' } },
    { id: nanoid(8), name: 'Gallery', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '08:45', to: '16:30' } }] }, then: { layoutId: id('Gallery'), state: 'gallery', score: 0, durationMs: 0, reason: 'Gallery' } },
    { id: nanoid(8), name: 'Welcome home', enabled: true, priority: 100, when: { all: [{ days: [...WEEKDAYS] }, { time: { from: '16:30', to: '18:30' } }] }, then: { layoutId: id('Welcome Home'), state: 'action', bob: { expression: 'happy' }, score: 0, durationMs: 0, reason: 'Welcome home' } },
    { id: nanoid(8), name: 'Evening', enabled: true, priority: 100, when: { time: { from: '18:30', to: '21:00' } }, then: { layoutId: id('Evening'), state: 'information', bob: { expression: 'talking' }, score: 0, durationMs: 0, reason: 'Evening' } },
    { id: nanoid(8), name: 'Weekend', enabled: true, priority: 100, when: { days: ['SAT', 'SUN'] }, then: { layoutId: id('Weekend'), state: 'ambient', bob: { expression: 'celebrate' }, score: 0, durationMs: 0, reason: 'Weekend' } },
    { id: nanoid(8), name: 'Rain', enabled: true, priority: 200, when: { weather: { rainProbabilityAbove: 60 } }, then: { layoutId: id('Weather'), state: 'weather', bob: { expression: 'reminder' }, score: 0, durationMs: 0, reason: 'Rain' } },
    { id: nanoid(8), name: 'Night', enabled: true, priority: 100, when: { time: { from: '21:00', to: '06:00' } }, then: { layoutId: id('Night'), state: 'ambient', score: 0, durationMs: 0, reason: 'Night' } },
  ]
}
```

- [ ] **Step 4: Wire them into `seed()` and export it**

Replace the body of `seed()`:

```ts
export function seed(): FrameStore {
  const now = new Date().toISOString()
  const album = seedPhotoAlbum()
  const layouts = curatedLayouts(album.id)
  const desk: Layout = {
    id: nanoid(10),
    name: 'Analog desk',
    createdAt: now,
    updatedAt: now,
    settings: { ...DEFAULT_SETTINGS, background: '/backgrounds/city-night.png', dim: 25 },
    widgets: [
      w('clock-analog', 290, 240, 500, 500, { template: 'numerals', style: { fontFamily: 'playfair' } as Widget['style'] }),
      w('date', 190, 780, 700, 120, { template: 'stacked', style: { fontFamily: 'playfair' } as Widget['style'] }),
      w('sun', 140, 1360, 800, 300, { template: 'arc' }),
      w('calendar', 140, 1680, 800, 160, { template: 'week' }),
    ],
  }
  const allLayouts = [...layouts, desk]
  const morningId = allLayouts[0].id
  return {
    activeId: morningId,
    layouts: allLayouts,
    albums: [album],
    presets: [],
    customFonts: [],
    schedule: {
      ...structuredClone(DEFAULT_SCHEDULE),
      rules: [
        { id: nanoid(8), layoutId: morningId, days: [0, 1, 2, 3, 4, 5, 6], start: '06:00', end: '18:00' },
        { id: nanoid(8), layoutId: desk.id, days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '06:00' },
      ],
    },
    experiences: { enabled: true, rules: defaultExperienceRules(allLayouts), settings: { schoolHolidays: [] } },
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run lib/__tests__/seed.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts lib/__tests__/seed.test.ts
git commit -m "feat(seed): curated layouts and default experience rules"
```

---

### Task 2: Extract testable draft helpers

**Files:**
- Create: `lib/experience-draft.ts`
- Create: `lib/__tests__/experience-draft.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/experience-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeDaysCondition, toggleWeekday } from '../experience-draft'

describe('mergeDaysCondition', () => {
  it('replaces a top-level days condition', () => {
    expect(mergeDaysCondition({ days: ['MON'] }, ['TUE', 'WED'])).toEqual({ days: ['TUE', 'WED'] })
  })

  it('preserves a sibling condition inside all', () => {
    const result = mergeDaysCondition({ all: [{ days: ['MON'] }, { time: { from: '09:00', to: '10:00' } }] }, ['THU'])
    expect(result).toEqual({ all: [{ days: ['THU'] }, { time: { from: '09:00', to: '10:00' } }] })
  })

  it('appends days to an all that has none', () => {
    const result = mergeDaysCondition({ all: [{ weather: { uvAbove: 5 } }] }, ['SAT'])
    expect(result).toEqual({ all: [{ weather: { uvAbove: 5 } }, { days: ['SAT'] }] })
  })

  it('wraps a non-composite condition without losing it', () => {
    expect(mergeDaysCondition({ weather: { rainProbabilityAbove: 60 } }, ['FRI'])).toEqual({
      all: [{ weather: { rainProbabilityAbove: 60 } }, { days: ['FRI'] }],
    })
  })
})

describe('toggleWeekday', () => {
  it('adds a missing day', () => {
    expect(toggleWeekday(['MON'], 'TUE', true)).toEqual(['MON', 'TUE'])
  })
  it('removes a present day', () => {
    expect(toggleWeekday(['MON', 'TUE'], 'MON', false)).toEqual(['TUE'])
  })
  it('is idempotent', () => {
    expect(toggleWeekday(['MON'], 'MON', true)).toEqual(['MON'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/experience-draft.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/experience-draft.ts`**

```ts
import type { Condition, Weekday } from './types'

/**
 * Replaces or inserts a `days` condition without discarding any other
 * condition the rule already carries. The editor only exposes days, but rules
 * authored through the API may contain time/weather/composite conditions.
 */
export function mergeDaysCondition(when: Condition, days: Weekday[]): Condition {
  if ('days' in when) return { days }
  if ('all' in when) {
    const hasDays = when.all.some(condition => 'days' in condition)
    if (hasDays) {
      return { all: when.all.map(condition => ('days' in condition ? { days } : condition)) }
    }
    return { all: [...when.all, { days }] }
  }
  return { all: [when, { days }] }
}

export function toggleWeekday(days: Weekday[], day: Weekday, on: boolean): Weekday[] {
  if (on) return days.includes(day) ? days : [...days, day]
  return days.filter(existing => existing !== day)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/__tests__/experience-draft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/experience-draft.ts lib/__tests__/experience-draft.test.ts
git commit -m "feat(editor): pure helpers to preserve rule conditions when toggling days"
```

---

### Task 3: Experiences panel — debounce, draft sync, composite preservation

**Files:**
- Modify: `components/editor/experiences-panel.tsx`

- [ ] **Step 1: Update imports**

Replace the React import and add the helper import:

```tsx
import { useEffect, useRef, useState } from 'react'
```

```tsx
import { mergeDaysCondition, toggleWeekday } from '@/lib/experience-draft'
```

- [ ] **Step 2: Add draft sync and debounce cleanup**

Immediately after `const timer = useRef<...>(null)`, add:

```tsx
  // Re-sync when the server store changes (e.g. normalize pruned a rule for a
  // deleted layout) but never clobber an in-flight debounced edit.
  useEffect(() => {
    if (timer.current) return
    setDraft(experiences)
  }, [experiences])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
```

- [ ] **Step 3: Make `updateRule` accept a debounce flag**

Replace:

```tsx
  const updateRule = (id: string, patch: Partial<ExperienceRule>) =>
    update({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
```

with:

```tsx
  const updateRule = (id: string, patch: Partial<ExperienceRule>, debounce = false) =>
    update({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, debounce)
```

- [ ] **Step 4: Debounce the rule-name input**

Change the name input `onChange` to:

```tsx
                    onChange={(e) => updateRule(rule.id, { name: e.target.value }, true)}
```

- [ ] **Step 5: Preserve composite conditions on day toggles**

Replace the weekday button `onClick` body:

```tsx
                        onClick={() => {
                          const currentDays = 'days' in rule.when ? rule.when.days : []
                          const nextDays = toggleWeekday(currentDays, value, !on)
                          updateRule(rule.id, { when: mergeDaysCondition(rule.when, nextDays) })
                        }}
```

Note: the `currentDays` and `on` values are already computed just above; keep them and only replace the state call. The final block should read:

```tsx
                  {WEEKDAY_OPTIONS.map(({ value, label }) => {
                    const currentDays = 'days' in rule.when ? rule.when.days : []
                    const on = currentDays.includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        aria-label={label}
                        onClick={() => updateRule(rule.id, { when: mergeDaysCondition(rule.when, toggleWeekday(currentDays, value, !on)) })}
                        className={
                          on
                            ? 'h-7 rounded-md bg-primary text-[11px] font-medium text-primary-foreground'
                            : 'h-7 rounded-md bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground'
                        }
                      >
                        {label[0]}
                      </button>
                    )
                  })}
```

- [ ] **Step 6: Debounce the settings text inputs**

Change the school-holidays input `onChange` to pass `true`:

```tsx
              onChange={(e) =>
                update(
                  {
                    ...draft,
                    settings: {
                      ...draft.settings,
                      schoolHolidays: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    },
                  },
                  true,
                )
              }
```

Change the timezone input `onChange` to pass `true`:

```tsx
            onChange={(e) => update({ ...draft, settings: { ...draft.settings, timezone: e.target.value || undefined } }, true)}
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass.

- [ ] **Step 8: Manual verification**

Run `npm run dev`, open the editor → Experiences. Type a long rule name and confirm in the network tab that a single `PUT /api/experiences` fires ~400 ms after typing stops (not per keystroke). Add a rule via the API with `when: { all: [{ days:['MON'] }, { weather:{ uvAbove: 5 } }] }`, open the panel, toggle a day, and confirm the weather condition survives in the saved payload.

- [ ] **Step 9: Commit**

```bash
git add components/editor/experiences-panel.tsx
git commit -m "fix(editor): debounce experiences writes, sync draft, preserve composite conditions"
```

---

### Task 4: Correct preview timezone conversion

**Files:**
- Create: `lib/zoned-time.ts`
- Create: `lib/__tests__/zoned-time.test.ts`
- Modify: `lib/engine/state.ts`
- Modify: `app/api/display/preview/route.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/zoned-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseZonedWallTime } from '../zoned-time'

describe('parseZonedWallTime', () => {
  it('interprets a naive time as wall time in the given zone', () => {
    // 18:15 in Zurich during CEST (UTC+2) is 16:15 UTC.
    const instant = parseZonedWallTime('2026-10-08T18:15', 'Europe/Zurich')
    expect(instant?.toISOString()).toBe('2026-10-08T16:15:00.000Z')
  })

  it('handles UTC', () => {
    expect(parseZonedWallTime('2026-10-08T18:15', 'UTC')?.toISOString()).toBe('2026-10-08T18:15:00.000Z')
  })

  it('returns null for malformed input', () => {
    expect(parseZonedWallTime('not-a-date', 'UTC')).toBeNull()
    expect(parseZonedWallTime('2026-10-08', 'UTC')).toBeNull()
  })

  it('returns null for an invalid zone', () => {
    expect(parseZonedWallTime('2026-10-08T18:15', 'Invalid/Zone')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/zoned-time.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lib/zoned-time.ts`**

```ts
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Interprets a timezone-less ISO wall time (`2026-10-08T18:15`) as the wall
 * clock in `timezone` and returns the corresponding instant. Returns null for
 * malformed input or an invalid zone.
 *
 * The offset is resolved by formatting the candidate instant back into the
 * target zone and measuring the difference. DST-ambiguous times resolve to the
 * offset in effect at the candidate instant, which is acceptable for preview.
 */
export function parseZonedWallTime(value: string, timezone: string): Date | null {
  const match = NAIVE.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const asUTC = Date.UTC(+year, +month - 1, +day, +hour, +minute, +(second ?? 0))

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(asUTC))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
    const zonedAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    const offset = zonedAsUTC - asUTC
    return new Date(asUTC - offset)
  } catch {
    return null
  }
}

/** Formats a Date as a `datetime-local` value in the browser's local zone. */
export function formatLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/__tests__/zoned-time.test.ts`
Expected: PASS.

- [ ] **Step 5: Let `getDecision` parse a simulated wall time**

In `lib/engine/state.ts`, add the import:

```ts
import { parseZonedWallTime } from '../zoned-time'
```

Extend `GetDecisionOptions`:

```ts
export interface GetDecisionOptions {
  simulatedTime?: Date
  /** Timezone-less wall time interpreted in the frame's configured zone. */
  simulatedWallTime?: string
  /** When false, skip appending to display_history. Defaults to true. */
  recordHistory?: boolean
}
```

Replace the time computation:

```ts
  const time = options?.simulatedTime || now
```

with:

```ts
  const time = options?.simulatedWallTime
    ? parseZonedWallTime(options.simulatedWallTime, timezone) ?? new Date(options.simulatedWallTime)
    : options?.simulatedTime || now
```

Ensure `const timezone = store.experiences.settings.timezone || 'UTC'` is declared **before** `time` (it is, after the correctness plan's Task 6 Step 4). If not, move it above.

- [ ] **Step 6: Forward the naive time from the preview route**

In `app/api/display/preview/route.ts`, replace the `new Date(...)` validation and the `getDecision` call:

```ts
  if (!body.dateTime || typeof body.dateTime !== 'string') {
    return NextResponse.json({ error: 'dateTime is required' }, { status: 400 })
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(body.dateTime)) {
    return NextResponse.json({ error: 'dateTime must be a timezone-less ISO string' }, { status: 400 })
  }

  try {
    const { decision, context } = await getDecision(frameId, new Date(), {
      simulatedWallTime: body.dateTime,
      recordHistory: false,
    })
```

- [ ] **Step 7: Add a state-level preview timezone test**

Append to `lib/engine/__tests__/state.test.ts`:

```ts
describe('preview wall time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set(), latestLayoutId: null })
    mockRecordDecision.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
    mockFetchWeather.mockResolvedValue(undefined)
  })

  it('interprets simulatedWallTime in the frame timezone', async () => {
    const store = makeStore({
      experiences: { enabled: true, rules: [], settings: { schoolHolidays: [], timezone: 'Europe/Zurich' } },
    })
    mockReadStore.mockResolvedValue(store)

    const { context } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedWallTime: '2026-10-08T18:15',
      recordHistory: false,
    })
    // 18:15 Zurich is the welcome-home period, and the weekday is Thursday.
    expect(context.period).toBe('welcome-home')
    expect(context.weekday).toBe('THU')
  })
})
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add lib/zoned-time.ts lib/__tests__/zoned-time.test.ts lib/engine/state.ts app/api/display/preview/route.ts lib/engine/__tests__/state.test.ts
git commit -m "fix(preview): interpret simulated time in the frame timezone"
```

---

### Task 5: Preview time picker and decision-aware editor preview

**Files:**
- Modify: `components/editor/experiences-panel.tsx` (`PreviewSection`)
- Modify: `components/editor/preview-overlay.tsx`
- Modify: `components/editor/editor.tsx`

- [ ] **Step 1: Add a time picker to `PreviewSection`**

Replace `PreviewSection` in `components/editor/experiences-panel.tsx` with:

```tsx
function PreviewSection({ frameId = 'home' }: { frameId?: string }) {
  const [dateTime, setDateTime] = useState(() => formatLocalInputValue(new Date()))
  const [preview, setPreview] = useState<{ decision?: { layoutId?: string; bob?: { expression?: string } | null; reason?: string }; context?: { period?: string }; warning?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runPreview() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/display/preview?frame=${encodeURIComponent(frameId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime }),
      })
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string }
        throw new Error(errData.error ?? `Preview failed (${res.status})`)
      }
      setPreview(await res.json())
    } catch (error) {
      console.error('Preview failed:', error)
      setError(error instanceof Error ? error.message : 'Preview failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Simulated time (frame local)</span>
        <input
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        />
      </label>
      <button
        type="button"
        onClick={runPreview}
        disabled={loading || !dateTime}
        className="flex h-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Preview decision'}
      </button>
      {error && <p className="text-pretty text-xs text-destructive">{error}</p>}
      {preview && (
        <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Layout:</span>
            <span className="font-mono text-foreground">{preview.decision?.layoutId ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bob:</span>
            <span className="font-mono text-foreground">{preview.decision?.bob?.expression ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reason:</span>
            <span className="font-mono text-foreground">{preview.decision?.reason ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Period:</span>
            <span className="font-mono text-foreground">{preview.context?.period ?? 'none'}</span>
          </div>
          {preview.warning && <p className="text-pretty text-amber-600">{preview.warning}</p>}
        </div>
      )}
    </div>
  )
}
```

Add the import at the top of the file:

```tsx
import { formatLocalInputValue } from '@/lib/zoned-time'
```

- [ ] **Step 2: Thread `decision` through `PreviewOverlay`**

Replace the props type and the `FrameScene` usage in `components/editor/preview-overlay.tsx`:

```tsx
import type { Album, DisplayDecision, LayoutSettings, NightMode, WeatherData, Widget } from '@/lib/types'

type PreviewOverlayProps = {
  name: string
  widgets: Widget[]
  settings: LayoutSettings
  weather: WeatherData | null
  now: Date | null
  album: Album | null
  night: NightMode | null
  decision?: DisplayDecision | null
  onClose: () => void
}

export function PreviewOverlay({ name, widgets, settings, weather, now, album, night, decision, onClose }: PreviewOverlayProps) {
```

and:

```tsx
          <FrameScene widgets={widgets} settings={settings} weather={weather} now={now} album={album} scale={scale} night={night} decision={decision} />
```

- [ ] **Step 3: Fetch the preview decision in the editor and pass it down**

In `components/editor/editor.tsx`, add state and an effect. Add near the other `useState` calls:

```tsx
  const [previewDecision, setPreviewDecision] = useState<DisplayDecision | null>(null)
```

Add `DisplayDecision` to the type import from `@/lib/types`.

Add an effect (after the existing `useEffect` blocks):

```tsx
  useEffect(() => {
    if (!previewOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/display/preview?frame=home', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateTime: formatLocalInputValue(new Date()) }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { decision?: DisplayDecision }
        if (!cancelled) setPreviewDecision(data.decision ?? null)
      } catch {
        if (!cancelled) setPreviewDecision(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [previewOpen])
```

Add the import:

```tsx
import { formatLocalInputValue } from '@/lib/zoned-time'
```

Pass it to the overlay:

```tsx
        <PreviewOverlay
          name={state.name}
          widgets={state.widgets}
          settings={state.settings}
          weather={weather}
          now={now}
          album={layoutAlbum}
          night={nightPreview ? store.schedule.night : null}
          decision={previewDecision}
          onClose={() => setPreviewOpen(false)}
        />
```

- [ ] **Step 4: Typecheck, build, and run the suite**

Run: `npx tsc --noEmit && npm run build && npx vitest run`
Expected: clean; build succeeds; tests pass.

- [ ] **Step 5: Manual verification**

Run `npm run dev`. Open Experiences → Preview, set the time to a known window (e.g. `18:15`) on a Zurich frame, and confirm the returned period is `welcome-home` and the layout is the Evening/Welcome Home layout. Open the canvas Preview overlay with a `source = decision` Bob widget and confirm it shows the decision expression, not the fixed one.

- [ ] **Step 6: Commit**

```bash
git add components/editor/experiences-panel.tsx components/editor/preview-overlay.tsx components/editor/editor.tsx
git commit -m "feat(editor): simulated-time picker and decision-aware preview overlay"
```

---

### Task 6: Final verification for this plan

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean.

- [ ] **Step 2: Acceptance walk-through (spec §14 items 2 and 4)**

With a fresh database (`DELETE FROM frame_documents WHERE identifier = 'home'`), load `/frame`, then call the preview endpoint at 07:00, 10:00, 17:00, and 20:00 on a weekday and confirm Morning, Gallery, Welcome Home, and Evening are selected. Then seed a rain probability > 60 and confirm the Weather layout wins (priority 200).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify bob editor and preview remediation"
```

---

## Self-Review

- **F-08** — Task 1 (curated layouts + enabled default rules). ✅
- **F-11** — Task 3 (debounce text inputs + cleanup). ✅
- **F-12** — Tasks 2 + 3 (draft sync, `mergeDaysCondition`). ✅
- **F-13** — Tasks 4 + 5 (correct zone parsing, picker, period display). ✅
- **F-17** — Task 5 (decision threaded into `PreviewOverlay`). ✅

Type consistency: `mergeDaysCondition`/`toggleWeekday` are defined and tested in Task 2 before use in Task 3; `parseZonedWallTime`/`formatLocalInputValue` are defined in Task 4 and reused in Task 5; `GetDecisionOptions.simulatedWallTime` is defined and consumed within Task 4; `PreviewOverlayProps.decision` matches `DisplayDecision | null` from `lib/types`. `PreviewSection`'s `formatLocalInputValue` import is added before use. No placeholders.
