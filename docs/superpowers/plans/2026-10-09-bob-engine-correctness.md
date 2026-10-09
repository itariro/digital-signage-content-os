# Bob Engine Correctness Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Bob widget render real artwork without breaking, stop the engine fabricating weather, and make scoring honest (weather relevance, duration eligibility, incumbent stability) with bounded history reads.

**Architecture:** Keep the pure `context → operators → evaluator → scoring → selector` pipeline. Change `scoring` to consume `EvaluatedRule[]` plus a `HistorySummary` (recent rows + seen layouts + latest layout) so the DB layer can return a bounded, targeted result instead of the whole table. `state.ts` remains the only impure orchestrator.

**Tech Stack:** TypeScript strict, Next.js 16, Drizzle ORM, PostgreSQL, Zod, Vitest, React 19.

**Findings covered:** F-01 (assets/widget), F-02 (sample weather), F-03 (unbounded history), F-04 (`durationMs`), F-05 (incumbent flapping), F-06 (weather relevance), F-07 (timezone mismatch), F-10 (expression validation, bob part), F-14 (speech bubble).

**Depends on:** Nothing. This plan can be executed first.

**Note:** Tasks 4–6 change `scoring.ts` signatures in sequence. Each task ends with a green suite; the later task supersedes the earlier signature.

---

## File Structure

**Create:**
- `lib/bob.ts` — Bob expression whitelist, asset resolver, inline SVG placeholder.
- `lib/__tests__/bob.test.ts` — unit tests for the resolver.
- `scripts/generate-bob-placeholders.mjs` — generates 12 valid WebP placeholders.
- `public/bob/*.webp` — 12 placeholder assets (replaced by real artwork later).
- `public/bob/README.md` — documents that these are placeholders.
- `drizzle/0001_add_rule_id_to_display_history.sql` — migration.
- `lib/__tests__/scoring-duration.test.ts` — duration/incumbent tests.

**Modify:**
- `vitest.config.ts` — broaden `include`.
- `components/frame/widget-content.tsx` — `BobWidget` (asset resolver, fallback, speech, badge).
- `lib/weather.ts` — expose sample flag cleanly (already has `sample`).
- `lib/engine/state.ts` — weather honesty, bounded history, duration, incumbent, timezone.
- `lib/engine/evaluator.ts` — `weatherMatched` computed correctly.
- `lib/engine/scoring.ts` — `EvaluatedRule[]` + `HistorySummary`, duration, incumbent.
- `lib/engine/selector.ts` — optional incumbent/hysteresis.
- `lib/engine/types.ts` — `HistoryEntry.ruleId`, `HistorySummary`.
- `lib/db/schema.ts` — `display_history.rule_id`.
- `lib/db/index.ts` — `queryHistory` bounded, `recordDecision` writes `ruleId`.
- `lib/engine/__tests__/scoring.test.ts` — rewritten for the new signature.
- `lib/engine/__tests__/evaluator.test.ts` — weather relevance cases.
- `lib/engine/__tests__/state.test.ts` — summary mock, weather honesty, duration, incumbent.

---

### Task 1: Bob expression resolver and widget correctness

**Files:**
- Create: `lib/bob.ts`
- Create: `lib/__tests__/bob.test.ts`
- Modify: `vitest.config.ts`
- Modify: `components/frame/widget-content.tsx` (BobWidget ~L75-104)

- [ ] **Step 1: Broaden the Vitest include so `lib/__tests__` runs**

Edit `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 2: Write the failing test**

Create `lib/__tests__/bob.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BOB_EXPRESSIONS, BOB_FALLBACK_EXPRESSION, BOB_PLACEHOLDER, bobAsset, isBobExpression } from '../bob'

describe('bob asset resolver', () => {
  it('resolves a known expression to a webp path', () => {
    expect(bobAsset('celebrate')).toBe('/bob/celebrate.webp')
  })

  it('falls back to happy for unknown expressions and non-strings', () => {
    expect(bobAsset('dancing')).toBe(`/bob/${BOB_FALLBACK_EXPRESSION}.webp`)
    expect(bobAsset(undefined)).toBe('/bob/happy.webp')
    expect(bobAsset(42)).toBe('/bob/happy.webp')
  })

  it('guards expression membership', () => {
    expect(isBobExpression('happy')).toBe(true)
    expect(isBobExpression('dancing')).toBe(false)
    expect(isBobExpression(null)).toBe(false)
  })

  it('exposes exactly the 12 spec expressions', () => {
    expect(BOB_EXPRESSIONS).toHaveLength(12)
    expect(new Set(BOB_EXPRESSIONS).size).toBe(12)
  })

  it('provides an inline data-uri placeholder', () => {
    expect(BOB_PLACEHOLDER.startsWith('data:image/svg+xml')).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/bob.test.ts`
Expected: FAIL — `Cannot find module '../bob'`.

- [ ] **Step 4: Implement `lib/bob.ts`**

```ts
import type { BobExpression } from './types'

export const BOB_EXPRESSIONS: readonly BobExpression[] = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
]

export const BOB_FALLBACK_EXPRESSION: BobExpression = 'happy'

/**
 * Inline SVG shown when the artwork file is missing, so a Bob widget is never a
 * broken image. Themed with the default accent so it reads as intentional.
 */
export const BOB_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<circle cx="100" cy="100" r="88" fill="#7cc4ff" opacity="0.22"/>' +
      '<circle cx="72" cy="86" r="12" fill="#ffffff"/>' +
      '<circle cx="128" cy="86" r="12" fill="#ffffff"/>' +
      '<path d="M64 128q36 34 72 0" stroke="#ffffff" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '</svg>',
  )

export function isBobExpression(value: unknown): value is BobExpression {
  return typeof value === 'string' && (BOB_EXPRESSIONS as readonly string[]).includes(value)
}

/** Resolves the semantic expression to an asset path, never a broken filename. */
export function bobAsset(expression: unknown): string {
  const safe = isBobExpression(expression) ? expression : BOB_FALLBACK_EXPRESSION
  return `/bob/${safe}.webp`
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/bob.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Rewrite `BobWidget` in `components/frame/widget-content.tsx`**

Replace the existing `BobWidget` function (currently ~L75-104) with:

```tsx
function handleBobError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.bobFallback) return
  img.dataset.bobFallback = '1'
  img.src = BOB_PLACEHOLDER
}

function BobWidget({ widget, ctx }: { widget: Widget; ctx: WidgetContext }) {
  const source = (widget.props.source as string) || 'fixed'
  const decisionExpression = ctx.decision?.bob?.expression
  const widgetExpression = widget.props.expression
  const expression =
    source === 'decision'
      ? isBobExpression(decisionExpression)
        ? decisionExpression
        : isBobExpression(widgetExpression)
          ? widgetExpression
          : BOB_FALLBACK_EXPRESSION
      : isBobExpression(widgetExpression)
        ? widgetExpression
        : BOB_FALLBACK_EXPRESSION
  const speech =
    source === 'decision'
      ? (ctx.decision?.bob?.speech ?? String(widget.props.speech ?? ''))
      : String(widget.props.speech ?? '')
  const animate = Boolean(widget.props.animate)
  const src = bobAsset(expression)

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={expression} className="h-full w-full object-contain" onError={handleBobError} />
  )

  return (
    <div className={cn('relative flex h-full w-full flex-col items-center justify-center', animate && 'animate-in fade-in')}>
      {widget.template === 'badge' ? (
        <div
          className="flex aspect-square h-full max-h-full items-center justify-center overflow-hidden rounded-full"
          style={{ background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
        >
          {image}
        </div>
      ) : (
        image
      )}
      {speech && widget.template === 'speech' && (
        <div className="absolute left-1/2 top-2 max-w-[90%] -translate-x-1/2 rounded-xl bg-white px-3 py-1 text-center text-sm font-medium text-gray-900 shadow-lg">
          {speech}
        </div>
      )}
    </div>
  )
}
```

Add the imports at the top of `widget-content.tsx` (next to the existing React import):

```tsx
import type { CSSProperties, SyntheticEvent } from 'react'
```

and:

```tsx
import { BOB_FALLBACK_EXPRESSION, BOB_PLACEHOLDER, bobAsset, isBobExpression } from '@/lib/bob'
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/bob.ts lib/__tests__/bob.test.ts vitest.config.ts components/frame/widget-content.tsx
git commit -m "fix(bob): validate expressions, add placeholder fallback, fix speech bubble and badge template"
```

---

### Task 2: Ship Bob artwork placeholders

**Files:**
- Create: `scripts/generate-bob-placeholders.mjs`
- Create: `public/bob/*.webp` (generated)
- Create: `public/bob/README.md`

- [ ] **Step 1: Add the generator script**

Create `scripts/generate-bob-placeholders.mjs`:

```js
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'public', 'bob')
const EXPRESSIONS = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
]

const PALETTE = {
  thinking: '#7cc4ff', action: '#ffb86b', celebrate: '#ff8fa3', idea: '#ffd36e',
  reminder: '#9be7c4', success: '#9be7c4', exercise: '#ffb86b', talking: '#c7b8ff',
  planning: '#7cc4ff', building: '#ffb86b', reading: '#f3ecd2', happy: '#ffd36e',
}

function svg(expression) {
  const accent = PALETTE[expression] ?? '#7cc4ff'
  const label = expression[0].toUpperCase() + expression.slice(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#0b0c10"/>
  <circle cx="200" cy="170" r="120" fill="${accent}" opacity="0.28"/>
  <circle cx="150" cy="150" r="16" fill="#ffffff"/>
  <circle cx="250" cy="150" r="16" fill="#ffffff"/>
  <path d="M130 220q70 66 140 0" stroke="#ffffff" stroke-width="18" fill="none" stroke-linecap="round"/>
  <text x="200" y="360" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" fill="${accent}">${label}</text>
</svg>`
}

const sharp = (await import('sharp')).default
await mkdir(OUT, { recursive: true })
for (const expression of EXPRESSIONS) {
  const buffer = await sharp(Buffer.from(svg(expression))).webp({ quality: 82 }).toBuffer()
  await writeFile(join(OUT, `${expression}.webp`), buffer)
}
await writeFile(
  join(OUT, 'README.md'),
  '# Bob placeholders\n\nThese 12 WebP files are generated placeholders.\nReplace them with real artwork of the same filenames; no code change is required.\n\nRegenerate with `node scripts/generate-bob-placeholders.mjs`.\n',
)
console.log(`Wrote ${EXPRESSIONS.length} placeholder assets to ${OUT}`)
```

- [ ] **Step 2: Install `sharp` and generate**

Run:
```bash
npm install -D sharp
node scripts/generate-bob-placeholders.mjs
```
Expected: `Wrote 12 placeholder assets to .../public/bob`.

- [ ] **Step 3: Verify the assets are valid WebP**

Run: `ls public/bob && file public/bob/happy.webp`
Expected: 12 `.webp` files plus `README.md`; `happy.webp` reports `Web/P image` (or `RIFF ... Web/P`).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-bob-placeholders.mjs public/bob package.json package-lock.json
git commit -m "feat(bob): add generated placeholder artwork so the widget renders"
```

---

### Task 3: Engine must not fabricate weather

**Files:**
- Modify: `lib/engine/state.ts` (~L69-74)
- Test: `lib/engine/__tests__/state.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `lib/engine/__tests__/state.test.ts` inside a new `describe`:

```ts
describe('weather honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set(), latestLayoutId: null })
    mockRecordDecision.mockResolvedValue(undefined)
    mockPruneHistory.mockResolvedValue(undefined)
  })

  it('drops sample weather so weather rules never match on fabricated data', async () => {
    const store = makeStore({
      experiences: {
        enabled: true,
        rules: [{
          id: 'rain', name: 'Rain', enabled: true, priority: 200,
          when: { weather: { rainProbabilityAbove: 60 } },
          then: { layoutId: 'layout-1', state: 'weather', score: 0, durationMs: 0 },
        }],
        settings: { schoolHolidays: [] },
      },
    })
    mockReadStore.mockResolvedValue(store)
    mockFetchWeather.mockResolvedValue({
      sample: true,
      current: { temp: 20, code: 1, isDay: true, uv: 5 },
      today: { high: 25, low: 15, uvMax: 6, sunrise: '', sunset: '' },
      daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 90 }],
      hourly: [],
    })

    const { decision, context } = await getDecision('home', new Date('2026-10-08T10:00:00Z'))
    expect(context.weather).toBeUndefined()
    expect(decision.ruleId).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/engine/__tests__/state.test.ts -t "drops sample weather"`
Expected: FAIL — `context.weather` is defined and the rain rule wins.

- [ ] **Step 3: Implement the filter in `lib/engine/state.ts`**

Replace the weather fetch block:

```ts
  const layout = store.layouts.find(l => l.id === store.activeId) || store.layouts[0]
  const weather = layout
    ? await fetchWeather(layout.settings.lat, layout.settings.lon, layout.settings.units)
    : undefined

  const context = buildContext(store, time, weather)
```

with:

```ts
  const layout = store.layouts.find(l => l.id === store.activeId) || store.layouts[0]
  const fetched = layout
    ? await fetchWeather(layout.settings.lat, layout.settings.lon, layout.settings.units)
    : undefined
  // Spec §10: weather unavailable => context.weather undefined, weather rules do
  // not match. A sample/fabricated reading must never drive a decision.
  const weather = fetched && !fetched.sample ? fetched : undefined

  const context = buildContext(store, time, weather)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/engine/__tests__/state.test.ts -t "drops sample weather"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/state.ts lib/engine/__tests__/state.test.ts
git commit -m "fix(engine): never let sample weather drive rule matching"
```

---

### Task 4: History carries `ruleId`

**Files:**
- Modify: `lib/engine/types.ts` (`HistoryEntry`)
- Modify: `lib/db/schema.ts` (`displayHistory`)
- Modify: `lib/db/index.ts` (`DecisionRecord`, `recordDecision`)
- Create: `drizzle/0001_add_rule_id_to_display_history.sql`

- [ ] **Step 1: Extend the type**

In `lib/engine/types.ts`, change `HistoryEntry`:

```ts
export interface HistoryEntry {
  layoutId: string
  ruleId: string | null
  shownAt: Date
}
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `lib/db/schema.ts`, inside `displayHistory`, add after `decisionId`:

```ts
  ruleId: text('rule_id'),
```

- [ ] **Step 3: Create the migration**

Create `drizzle/0001_add_rule_id_to_display_history.sql`:

```sql
ALTER TABLE "display_history" ADD COLUMN IF NOT EXISTS "rule_id" text;
```

- [ ] **Step 4: Write `ruleId` in `recordDecision`**

In `lib/db/index.ts`, extend `DecisionRecord` and the insert:

```ts
export interface DecisionRecord {
  id: string
  layoutId: string
  ruleId: string | null
  score: number
}
```

and inside `.values({ ... })` add:

```ts
        ruleId: decision.ruleId,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors in `state.ts` (`recordDecision` now needs `ruleId`) and tests — resolved in Task 5/6. If you are executing task-by-task and want a green build now, pass `ruleId: rule.id` at the `recordDecision` call site in `state.ts` and `ruleId: null` in any test fixtures that build `DecisionRecord`.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/types.ts lib/db/schema.ts lib/db/index.ts drizzle/0001_add_rule_id_to_display_history.sql lib/engine/state.ts
git commit -m "feat(db): record rule_id in display history for duration eligibility"
```

---

### Task 5: Honest scoring — weather relevance, duration, incumbent continuity

**Files:**
- Modify: `lib/engine/evaluator.ts`
- Modify: `lib/engine/scoring.ts`
- Modify: `lib/engine/selector.ts`
- Modify: `lib/engine/types.ts` (`HistorySummary`)
- Modify: `lib/engine/__tests__/scoring.test.ts`
- Modify: `lib/engine/__tests__/evaluator.test.ts`
- Create: `lib/__tests__/scoring-duration.test.ts`

- [ ] **Step 1: Add `HistorySummary` to `lib/engine/types.ts`**

```ts
export interface HistorySummary {
  /** Shows within the repetition/duration window. */
  recent: HistoryEntry[]
  /** Layout ids seen within the novelty retention window. */
  seenLayouts: Set<string>
  /** The most recently shown layout, or null when history is empty. */
  latestLayoutId: string | null
}
```

- [ ] **Step 2: Write failing tests for weather relevance in the evaluator**

Replace `lib/engine/__tests__/evaluator.test.ts` with:

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

function rule(when: ExperienceRule['when']): ExperienceRule {
  return { id: 'r1', name: 'Test', enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } }
}

describe('evaluateRules', () => {
  it('returns empty array when no rules match', () => {
    expect(evaluateRules([rule({ days: ['MON'] })], makeContext({ weekday: 'THU' }))).toEqual([])
  })

  it('returns matching rules', () => {
    const result = evaluateRules([rule({ days: ['THU'] })], makeContext({ weekday: 'THU' }))
    expect(result).toHaveLength(1)
    expect(result[0].rule.id).toBe('r1')
  })

  it('skips disabled rules', () => {
    const disabled = { ...rule({ days: ['THU'] }), enabled: false }
    expect(evaluateRules([disabled], makeContext({ weekday: 'THU' }))).toEqual([])
  })

  it('marks weatherMatched when a weather node is satisfied', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 61, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 75 }], hourly: [] },
    })
    const result = evaluateRules([rule({ all: [{ days: ['THU'] }, { weather: { rainProbabilityAbove: 60 } }] })], ctx)
    expect(result[0].weatherMatched).toBe(true)
  })

  it('does not mark weatherMatched when an any-branch matched for another reason', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 1, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 1, max: 18, min: 10, rainProbability: 10 }], hourly: [] },
    })
    const result = evaluateRules([rule({ any: [{ days: ['THU'] }, { weather: { rainProbabilityAbove: 60 } }] })], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].weatherMatched).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/engine/__tests__/evaluator.test.ts`
Expected: FAIL on the two new weather cases (current `weatherMatched` only checks top-level `'weather' in when`).

- [ ] **Step 4: Implement the evaluator fix**

Replace `lib/engine/evaluator.ts` with:

```ts
import type { Condition, ExperienceRule, ExperienceContext } from './types'
import { evaluateCondition } from './operators'

export interface EvaluatedRule {
  rule: ExperienceRule
  weatherMatched: boolean
}

/**
 * True when at least one positive weather node inside the tree is satisfied.
 * Negated weather never earns relevance, so a rule that matched because it did
 * *not* rain is not rewarded as if it were weather-driven.
 */
function hasSatisfiedWeather(condition: Condition, ctx: ExperienceContext): boolean {
  if ('weather' in condition) return evaluateCondition(condition, ctx)
  if ('all' in condition) return condition.all.some(c => hasSatisfiedWeather(c, ctx))
  if ('any' in condition) return condition.any.some(c => hasSatisfiedWeather(c, ctx))
  return false
}

export function evaluateRules(rules: ExperienceRule[], ctx: ExperienceContext): EvaluatedRule[] {
  return rules
    .filter(rule => rule.enabled)
    .map(rule => ({ rule, weatherMatched: hasSatisfiedWeather(rule.when, ctx) }))
    .filter(({ rule }) => evaluateCondition(rule.when, ctx))
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/engine/__tests__/evaluator.test.ts`
Expected: PASS.

- [ ] **Step 6: Write failing tests for scoring (weather, duration, incumbent)**

Replace `lib/engine/__tests__/scoring.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { scoreCandidates } from '../scoring'
import type { EvaluatedRule } from '../evaluator'
import type { ExperienceRule, HistorySummary } from '../types'

function ev(rule: ExperienceRule, weatherMatched = false): EvaluatedRule {
  return { rule, weatherMatched }
}

function rule(overrides: Partial<ExperienceRule> & { then?: Partial<ExperienceRule['then']> } = {}): ExperienceRule {
  return {
    id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] },
    then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 },
    ...overrides,
    ...(overrides.then ? { then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0, ...overrides.then } } : {}),
  } as ExperienceRule
}

function summary(partial: Partial<HistorySummary> = {}): HistorySummary {
  return { recent: [], seenLayouts: new Set(), latestLayoutId: null, ...partial }
}

const NOW = Date.parse('2026-10-08T10:00:00Z')
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000)

describe('scoreCandidates', () => {
  it('computes base score with cold-start novelty', () => {
    const result = scoreCandidates([ev(rule())], summary(), '', NOW)
    expect(result[0].score).toBe(140) // 100 + 0 + 0 + 40 - 0
  })

  it('adds weather relevance only when weather was satisfied', () => {
    const [matched] = scoreCandidates([ev(rule(), true)], summary(), '', NOW)
    const [unmatched] = scoreCandidates([ev(rule(), false)], summary(), '', NOW)
    expect(matched.score - unmatched.score).toBe(20)
  })

  it('withdraws novelty for a layout seen within retention', () => {
    const result = scoreCandidates([ev(rule())], summary({ seenLayouts: new Set(['l1']) }), '', NOW)
    expect(result[0].score).toBe(100)
  })

  it('applies the repetition ladder from recent history', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'other', shownAt: minutesAgo(3) }]
    const result = scoreCandidates([ev(rule())], summary({ recent, seenLayouts: new Set(['l1']) }), '', NOW)
    expect(result[0].score).toBe(-200) // 100 - 300
  })

  it('does not penalise the incumbent layout', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(3) }]
    const result = scoreCandidates([ev(rule())], summary({ recent, seenLayouts: new Set(['l1']), latestLayoutId: 'l1' }), 'l1', NOW)
    expect(result[0].score).toBe(100) // no -300 because it is already showing
  })

  it('suppresses a rule still inside its durationMs window', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(10) }]
    const suppressed = scoreCandidates(
      [ev(rule({ id: 'r1', then: { durationMs: 60 * 60 * 1000 } }))],
      summary({ recent }),
      '',
      NOW,
    )
    expect(suppressed).toHaveLength(0)
  })

  it('allows a rule once its durationMs window has elapsed', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(90) }]
    const allowed = scoreCandidates(
      [ev(rule({ id: 'r1', then: { durationMs: 60 * 60 * 1000 } }))],
      summary({ recent }),
      '',
      NOW,
    )
    expect(allowed).toHaveLength(1)
  })
})
```

- [ ] **Step 7: Run to verify failure**

Run: `npx vitest run lib/engine/__tests__/scoring.test.ts`
Expected: FAIL (signature/behaviour mismatch).

- [ ] **Step 8: Implement `lib/engine/scoring.ts`**

```ts
import type { EvaluatedRule } from './evaluator'
import type { ExperienceRule, HistoryEntry, HistorySummary, ScoredCandidate } from './types'

const NOVELTY_BONUS = 40
const WEATHER_RELEVANCE = 20

function getRepetitionPenalty(
  recent: HistoryEntry[],
  layoutId: string,
  currentLayoutId: string,
  nowMs: number,
): number {
  if (layoutId === currentLayoutId) return 0

  let latest = -Infinity
  for (const entry of recent) {
    if (entry.layoutId === layoutId) latest = Math.max(latest, entry.shownAt.getTime())
  }
  if (latest === -Infinity) return 0

  const age = nowMs - latest
  if (age < 5 * 60 * 1000) return 300
  if (age < 30 * 60 * 1000) return 150
  if (age < 120 * 60 * 1000) return 50
  return 0
}

function isEligibleByDuration(rule: ExperienceRule, recent: HistoryEntry[], nowMs: number): boolean {
  const duration = rule.then.durationMs
  if (!duration) return true
  let latest = -Infinity
  for (const entry of recent) {
    if (entry.ruleId === rule.id) latest = Math.max(latest, entry.shownAt.getTime())
  }
  return latest === -Infinity || nowMs - latest >= duration
}

export function scoreCandidates(
  candidates: EvaluatedRule[],
  history: HistorySummary,
  currentLayoutId: string,
  nowMs: number = Date.now(),
): ScoredCandidate[] {
  return candidates
    .filter(({ rule }) => isEligibleByDuration(rule, history.recent, nowMs))
    .map(({ rule, weatherMatched }) => {
      const weatherRelevance = weatherMatched ? WEATHER_RELEVANCE : 0
      const novelty = history.seenLayouts.has(rule.then.layoutId) ? 0 : NOVELTY_BONUS
      const penalty = getRepetitionPenalty(history.recent, rule.then.layoutId, currentLayoutId, nowMs)
      const score = rule.priority + rule.then.score + weatherRelevance + novelty - penalty
      return { rule, score, layoutId: rule.then.layoutId }
    })
}
```

- [ ] **Step 9: Run to verify pass**

Run: `npx vitest run lib/engine/__tests__/scoring.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 10: Write failing tests for incumbent hysteresis in the selector**

Append to `lib/engine/__tests__/selector.test.ts`:

```ts
describe('selectWinner with incumbent', () => {
  it('keeps the incumbent when a challenger does not clear the hysteresis margin', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('challenger', 100), score: 140, layoutId: 'l-challenger' },
      { rule: makeRule('incumbent', 100), score: 130, layoutId: 'l-incumbent' },
    ]
    const winner = selectWinner(candidates, { incumbentLayoutId: 'l-incumbent', hysteresis: 25 })
    expect(winner?.layoutId).toBe('l-incumbent')
  })

  it('switches when the challenger clears the margin', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('challenger', 100), score: 200, layoutId: 'l-challenger' },
      { rule: makeRule('incumbent', 100), score: 130, layoutId: 'l-incumbent' },
    ]
    const winner = selectWinner(candidates, { incumbentLayoutId: 'l-incumbent', hysteresis: 25 })
    expect(winner?.layoutId).toBe('l-challenger')
  })

  it('ignores the incumbent option when not supplied', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('a', 100), score: 140, layoutId: 'l-a' },
      { rule: makeRule('b', 100), score: 130, layoutId: 'l-b' },
    ]
    expect(selectWinner(candidates)?.layoutId).toBe('l-a')
  })
})
```

- [ ] **Step 11: Implement `lib/engine/selector.ts`**

```ts
import type { ScoredCandidate } from './types'

export interface SelectWinnerOptions {
  incumbentLayoutId?: string | null
  /** Challengers must beat the incumbent by this many points to switch. */
  hysteresis?: number
}

/**
 * Picks the winning candidate. Highest `score` wins; ties break on higher
 * `rule.priority`, then lexicographically on `rule.id`. When an incumbent
 * layout is supplied with a hysteresis margin, the incumbent is retained unless
 * a challenger clears that margin — this prevents 30-second flapping.
 *
 * Pure: the input array is never mutated.
 */
export function selectWinner(
  candidates: ScoredCandidate[],
  options: SelectWinnerOptions = {},
): ScoredCandidate | null {
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority
    return a.rule.id.localeCompare(b.rule.id)
  })
  const best = sorted[0]

  const { incumbentLayoutId, hysteresis = 0 } = options
  if (incumbentLayoutId && hysteresis > 0) {
    const incumbent = sorted.find(candidate => candidate.layoutId === incumbentLayoutId)
    if (incumbent && incumbent.score + hysteresis >= best.score) return incumbent
  }
  return best
}
```

- [ ] **Step 12: Run the whole suite**

Run: `npx vitest run`
Expected: PASS except `state.test.ts` (still uses the old `queryHistory` shape and old `scoreCandidates` call) — fixed in Task 6.

- [ ] **Step 13: Commit**

```bash
git add lib/engine/types.ts lib/engine/evaluator.ts lib/engine/scoring.ts lib/engine/selector.ts \
  lib/engine/__tests__/evaluator.test.ts lib/engine/__tests__/scoring.test.ts lib/engine/__tests__/selector.test.ts
git commit -m "fix(engine): honest weather relevance, duration eligibility, and incumbent hysteresis"
```

---

### Task 6: Bounded history reads and unified timezone

**Files:**
- Modify: `lib/db/index.ts` (`queryHistory`)
- Modify: `lib/engine/state.ts`
- Modify: `lib/engine/__tests__/state.test.ts`

- [ ] **Step 1: Implement the bounded `queryHistory`**

Replace `queryHistory` in `lib/db/index.ts` (and update imports to include `gte`, `desc`):

```ts
import { and, desc, eq, gte, lt } from 'drizzle-orm'
```

```ts
/**
 * Returns a bounded history summary for scoring:
 * - `recent`: rows inside the repetition/duration window (caller supplies it).
 * - `seenLayouts`: distinct layouts inside the 7-day novelty retention window.
 * - `latestLayoutId`: the most recently shown layout (the incumbent).
 *
 * The previous implementation loaded the entire 7-day table for the frame on
 * every 30s poll; this keeps the read proportional to the window.
 */
export async function queryHistory(
  frameId: string,
  now: Date,
  windowMs: number,
): Promise<HistorySummary> {
  const db = getDb()
  const windowStart = new Date(now.getTime() - windowMs)
  const retentionStart = new Date(now.getTime() - RETENTION_MS)

  const [recentRows, seenRows, latestRows] = await Promise.all([
    db
      .select({ layoutId: displayHistory.layoutId, ruleId: displayHistory.ruleId, shownAt: displayHistory.shownAt })
      .from(displayHistory)
      .where(and(eq(displayHistory.frameId, frameId), gte(displayHistory.shownAt, windowStart))),
    db
      .selectDistinct({ layoutId: displayHistory.layoutId })
      .from(displayHistory)
      .where(and(eq(displayHistory.frameId, frameId), gte(displayHistory.shownAt, retentionStart))),
    db
      .select({ layoutId: displayHistory.layoutId })
      .from(displayHistory)
      .where(eq(displayHistory.frameId, frameId))
      .orderBy(desc(displayHistory.shownAt))
      .limit(1),
  ])

  return {
    recent: recentRows.map(r => ({ layoutId: r.layoutId, ruleId: r.ruleId, shownAt: r.shownAt })),
    seenLayouts: new Set(seenRows.map(r => r.layoutId)),
    latestLayoutId: latestRows[0]?.layoutId ?? null,
  }
}
```

Change the import at the top of `lib/db/index.ts`:

```ts
import type { HistorySummary } from '../engine/types'
```

- [ ] **Step 2: Update `lib/engine/state.ts` to use the summary**

Replace the history block and scoring call:

```ts
  const layoutIds = new Set(store.layouts.map(l => l.id))
  const eligibleRules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  const evaluated = evaluateRules(eligibleRules, context)

  let history: HistoryEntry[] = []
  try {
    history = await queryHistory(frameId)
  } catch (error) {
    log('error', 'Failed to query history', { frameId, error: String(error) })
  }

  const scored = scoreCandidates(evaluated.map(e => e.rule), history, '')
  const winner = selectWinner(scored)
```

with:

```ts
  const layoutIds = new Set(store.layouts.map(l => l.id))
  const eligibleRules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  const evaluated = evaluateRules(eligibleRules, context)

  const maxDurationMs = eligibleRules.reduce((max, rule) => Math.max(max, rule.then.durationMs), 0)
  const windowMs = Math.max(120 * 60 * 1000, maxDurationMs)
  let history: HistorySummary = { recent: [], seenLayouts: new Set(), latestLayoutId: null }
  try {
    history = await queryHistory(frameId, time, windowMs)
  } catch (error) {
    log('error', 'Failed to query history', { frameId, error: String(error) })
  }

  const incumbent = history.latestLayoutId ?? ''
  const scored = scoreCandidates(evaluated, history, incumbent, time.getTime())
  const winner = selectWinner(scored, { incumbentLayoutId: incumbent, hysteresis: INCUMBENT_HYSTERESIS })
```

Update imports in `state.ts`:

```ts
import type { DisplayDecision, ExperienceContext, HistorySummary } from './types'
```

and add near the top:

```ts
const INCUMBENT_HYSTERESIS = 25
```

- [ ] **Step 3: Pass `ruleId` to `recordDecision`**

The `recordDecision` call passes the decision object directly, and `DecisionRecord` now includes `ruleId`, so no change is required beyond the type. Confirm the call reads:

```ts
      await recordDecision(frameId, decision, new Date())
```

- [ ] **Step 4: Unify the fallback timezone (F-07)**

At the top of `getDecision`, replace:

```ts
  const timezone = store.experiences.settings.timezone
```

with:

```ts
  // One resolved timezone for both context and schedule fallback (spec §4.3).
  const timezone = store.experiences.settings.timezone || 'UTC'
```

`resolveFallbackLayout(store, time, timezone)` now receives a concrete zone, so `clockParts` no longer silently uses server-local time.

- [ ] **Step 5: Update `state.test.ts` mocks and add a fallback test**

Change every `mockQueryHistory.mockResolvedValue([])` to:

```ts
mockQueryHistory.mockResolvedValue({ recent: [], seenLayouts: new Set(), latestLayoutId: null })
```

Update the `recordDecision` assertion to include `ruleId`:

```ts
    expect(mockRecordDecision).toHaveBeenCalledWith(
      'home',
      expect.objectContaining({
        id: expect.any(String),
        layoutId: 'layout-1',
        ruleId: 'r1',
        score: expect.any(Number),
      }),
      expect.any(Date)
    )
```

Add a test asserting the fallback uses the configured timezone for the schedule:

```ts
  it('resolves the schedule fallback in the configured timezone (not server local)', async () => {
    mockReadStore.mockResolvedValue(
      scheduledStore({ id: 's1', layoutId: 'layout-2', days: [5], start: '13:00', end: '14:00' }, 'Pacific/Kiritimati')
    )
    const { decision } = await getDecision('home', new Date('2026-01-01T00:00:00Z'), {
      simulatedTime: new Date('2026-10-08T23:30:00Z'),
    })
    expect(decision.layoutId).toBe('layout-2')
  })
```

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add lib/db/index.ts lib/engine/state.ts lib/engine/__tests__/state.test.ts
git commit -m "fix(engine): bounded history reads and one timezone for context and fallback"
```

---

### Task 7: Final verification for this plan

- [ ] **Step 1: Full suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean, all tests pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual smoke**

Run `npm run dev`, open `/frame`, add a `bob` widget with `source = fixed` and each template (`plain`, `speech`, `badge`); confirm the character renders (placeholder artwork), the speech bubble is visible inside the box, and the badge is circular. Point the widget at `source = decision` and confirm it falls back to the widget expression when no rule matches.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: verify bob engine correctness remediation"
```

---

## Self-Review

- **F-01** — Task 1 (resolver/fallback) + Task 2 (assets). ✅
- **F-02** — Task 3. ✅
- **F-03** — Task 6. ✅
- **F-04** — Tasks 4 + 5 (ruleId + duration filter). ✅
- **F-05** — Task 5 (incumbent penalty + hysteresis). ✅
- **F-06** — Tasks 5 (evaluator `hasSatisfiedWeather` + scoring). ✅
- **F-07** — Task 6 Step 4. ✅
- **F-10 (expression part)** — Task 1. Theme part is in the hardening plan.
- **F-14** — Task 1 Step 6. ✅

Type consistency: `HistorySummary` is defined in Task 5 and consumed in Task 6; `HistoryEntry.ruleId` defined in Task 4 and used in Task 5; `selectWinner` options defined and tested in Task 5; `DecisionRecord.ruleId` defined in Task 4 and satisfied by `DisplayDecision.ruleId` (already present). No placeholders.
