# Bob Engine for Digital Signage Content OS

- **Date:** 2026-10-08
- **Status:** Approved design, pending implementation plan
- **Scope:** First slice. Port the familyOS context → rules → scoring → selector engine into dscos, plus a decision-aware Bob widget, running on data dscos already has.
- **Source of truth:** familyOS `frame.md` and `docs/superpowers/specs/2026-10-05-bob-frame-mvp-design.md`. This document ports the Bob system into dscos and resolves how the two models fit.

> **One-line goal:** dscos keeps its widget and layout authoring, and gains a backend brain that decides which layout is live and what Bob is feeling, without a hardcoded screen anywhere.

---

## 1. Summary

familyOS built the brain: a deterministic pipeline that turns household context into a `DisplayDecision` carrying a screen, a Bob expression, and a reason. Its screens are hardcoded React templates with no authoring model.

dscos built the hands and eyes: a widget library, a canvas layout editor, and a data-driven display renderer, all persisted as one document per frame.

They are complementary. This design gives dscos the familyOS brain while keeping dscos's authoring and rendering. The engine is ported to TypeScript and runs server-side inside the Next.js app. Rules select an authored layout and a Bob spec. A new `bob` widget reads its expression from the decision when it is set to follow the experience. dscos's existing day/time schedule stays as a fallback.

### Ownership boundary (frozen)

| System | Responsibility |
| --- | --- |
| dscos store document | Layouts, widgets, albums, experiences |
| dscos engine | Understand the moment, decide the layout, choose Bob |
| dscos widgets | Render what the layout and decision describe |
| Bob widget | Give the decision a face |
| dscos display | Poll, render, transition |

---

## 2. Goals and non-goals

### Goals

1. A server-side TypeScript engine: context → rules → scoring → selector → `DisplayDecision`.
2. Rules map context to an authored layout plus a Bob expression, with a reason and score.
3. A `bob` widget that can show a fixed expression or follow the current decision.
4. Curated Bob layouts so a fresh frame looks intentional.
5. An Experiences panel and a simulated-time preview in the editor.
6. The existing schedule and display behaviour preserved as fallbacks.
7. Pure engine modules with unit tests.

### Non-goals (this slice)

- Calendar, ICS sync, tasks, routines, activities, and the `event`/`activity` rule conditions.
- The content library and media pipeline. Albums are the content source.
- The artwork-upload celebration flow.
- LLM wording.
- Removing dscos's existing `ScheduleRule`.
- Multi-frame household configuration.

---

## 3. Architecture

### 3.1 Engine placement

The engine is TypeScript, server-side, under `lib/engine/`, mirroring the familyOS module layout so it stays pure and testable without a server or database.

| familyOS | dscos |
| --- | --- |
| `services/context.py` | `lib/engine/context.ts` |
| `rules/operators.py` | `lib/engine/operators.ts` |
| `rules/evaluator.py` | `lib/engine/evaluator.ts` |
| `rules/scoring.py` | `lib/engine/scoring.ts` |
| `services/selector.py` | `lib/engine/selector.ts` |
| `services/engine.py` | `lib/engine/state.ts` |
| `api/v1/display.py` | `app/api/display/state/route.ts`, `app/api/display/preview/route.ts` |
| `components/Bob.tsx` | Bob widget in `lib/widgets.ts` + `components/frame/widget-content.tsx` |
| `packages/domain/src/display.ts` | `lib/engine/types.ts` |

`context.ts` through `selector.ts` are pure functions. `state.ts` is the only impure module: it loads the frame store, builds context (including weather), evaluates, scores, selects, records history, and returns the decision.

### 3.2 Decision endpoint

```
GET  /api/display/state?frame=<id>     -> { decision, context, store }
POST /api/display/preview              -> { decision, context } for a simulated dateTime
```

The response carries the store as well, so the display's single 30-second poll refreshes both content and decision. `decision.id` is a stable hash of `ruleId`, `layoutId`, `state`, `bob.expression`, and `bob.speech`, so the display transitions only when one of those changes.

### 3.3 Precedence

The experience engine sits above the existing schedule:

1. An experience rule matches: that layout and Bob.
2. No experience match, schedule enabled: existing `resolveDisplay` layout, no decision Bob.
3. Otherwise: the frame's active layout.

An unconfigured frame behaves exactly as it does today. Turning experiences on takes over cleanly. dscos's day/time rules can be folded into experience rules later, but they do not need to be removed for this slice.

---

## 4. Experience model

### 4.1 Rule shape

Rules are declarative JSON. No code. Shared unions, ported from familyOS `packages/domain/src/display.ts`:

```ts
type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'

type DisplayState =
  | 'ambient' | 'information' | 'action' | 'celebration'
  | 'activity' | 'gallery' | 'weather' | 'family'

type BobExpression =
  | 'thinking' | 'action' | 'celebrate' | 'idea' | 'reminder' | 'success'
  | 'exercise' | 'talking' | 'planning' | 'building' | 'reading' | 'happy'
```

```ts
interface ExperienceRule {
  id: string
  name: string
  enabled: boolean
  priority: number                 // 0-1000
  when: Condition
  then: {
    layoutId: string
    state: DisplayState
    bob?: { expression: BobExpression; speech?: string }
    score: number                  // additive
    durationMs: number
    reason?: string                // label; else derived from the rule
  }
}

type Condition =
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
```

`event` and `activity` conditions from familyOS are deliberately absent. They arrive with calendar and tasks in a later slice. The schema is a superset-ready subset, so adding them does not reshape the engine.

### 4.2 Decision shape

```ts
interface DisplayDecision {
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
```

`ruleId` and `reason` feed the "Why am I seeing this?" panel.

### 4.3 Context

Built from what dscos already has.

```ts
interface ExperienceContext {
  now: string
  date: { iso: string; day: string; dayNumber: number; month: string; year: number }
  weekday: Weekday
  period: 'night' | 'morning' | 'day' | 'welcome-home' | 'evening' | 'wind-down'
  schoolDay: boolean
  weather?: WeatherSnapshot
  specialTags: string[]
}
```

- Period boundaries: night `<06:00`, morning `06:00-08:45`, day `08:45-16:30`, welcome-home `16:30-18:30`, evening `18:30-21:00`, wind-down `>21:00`.
- Weather comes from the same Open-Meteo service dscos already calls, refactored into a server-side `lib/weather.ts` shared by the engine and the widget route, cached 10-15 minutes.
- `schoolDay` is weekday and the date is not in the configured holiday list.
- `specialTags` are derived from weather (`rain`, `heat`, `cold`, `uv`) so rules can match without parsing prose.

The context must use the frame's configured timezone, not server UTC.

### 4.4 Scoring and selection

```
score = rule.priority
      + then.score
      + weatherRelevance
      + novelty
      - repetitionPenalty
```

- `weatherRelevance`: `+20` when the rule's `when.weather` condition is present and matched.
- `novelty`: `+40` when the layout has not appeared in `display_history` within the retention window, else `0`.
- `repetitionPenalty`: `300` under 5 minutes, `150` under 30, `50` under 120, else `0`, read from `display_history`.

The selector drops ineligible candidates (a missing `layoutId`), sorts by score descending, tie-breaks by priority then stable rule id, and returns the winner.

### 4.5 Seeded default rules

| Rule | Window | Layout | Bob | State |
| --- | --- | --- | --- | --- |
| Morning | weekdays 06:00-08:45 | Morning | planning | action |
| Gallery | weekdays 08:45-16:30 | Gallery | none | gallery |
| Welcome home | weekdays 16:30-18:30 | Welcome Home | happy | action |
| Evening | 18:30-21:00 | Evening | talking | information |
| Weekend | Sat/Sun | Weekend | celebrate | ambient |
| Rain | rain probability > 60% | Weather | reminder | weather |
| Night | 21:00-06:00 | Night | none | ambient |

---

## 5. Storage and schema

### 5.1 Experiences live in the frame document

```ts
FrameStore.experiences: {
  enabled: boolean
  rules: ExperienceRule[]
  settings: { schoolHolidays: string[]; timezone?: string }
}
```

This mirrors `schedule` and needs no migration. It travels with the frame and is written by the existing store mutation path. `lib/schema.ts` gains a zod schema for it, so a malformed rule never reaches the engine.

### 5.2 History is a table

`display_history` is append-only and does not fit the document model.

```sql
CREATE TABLE display_history (
  id BIGSERIAL PRIMARY KEY,
  frame_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  layout_id TEXT NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL,
  score DOUBLE PRECISION NOT NULL
);
CREATE INDEX display_history_frame_time ON display_history (frame_id, shown_at);
```

Rows older than a retention window are pruned by the decision path or a scheduled job.

### 5.3 Migration tooling

dscos has no migration tooling today: no `drizzle-kit`, no config, no `CREATE TABLE`. The table needs a creation path.

- **Recommended:** add `drizzle-kit` and `drizzle.config.ts`, add `displayHistory` to `lib/db/schema.ts`, and generate and apply a migration. Standard Drizzle flow, and the next slice needs calendar and task tables anyway.
- **Lighter alternative:** an idempotent `CREATE TABLE IF NOT EXISTS` bootstrap run on first use. No new tooling, but ad hoc.

---

## 6. Bob widget and assets

### 6.1 Widget type

A new `bob` type joins `WIDGET_TYPES`. Geometry and style come from the widget box like every other widget, so placement, size, radius, and shadow are the author's, not the engine's.

| Prop | Kind | Meaning |
| --- | --- | --- |
| `source` | select | `fixed` or `decision` |
| `expression` | select | one of the 12 states, used when `source = fixed` |
| `speech` | text | optional caption for the `speech` template |
| `animate` | toggle | subtle entrance, off by default |

Templates: `plain` (Bob contained in the box), `speech` (Bob with a speech bubble), `badge` (circular, for small placements).

### 6.2 Decision binding

`WidgetContext` gains `decision?: DisplayDecision | null`, threaded through `FrameScene` and `WidgetBody`. When `source = decision`:

- `expression` comes from `ctx.decision.bob.expression`, falling back to the widget's own `expression`.
- `speech` comes from `ctx.decision.bob.speech` if present, otherwise the widget's `speech` prop.

The decision supplies expression and speech only. It never dictates template, size, position, or style. That is what lets one Welcome Home layout host `happy` on a normal afternoon and `celebrate` on movie night without the author editing the layout.

### 6.3 Assets

familyOS has 12 placeholder variants under `assets/bob/*.webp`. They are copied to dscos `public/bob/<state>.webp`, and the widget resolves the image from the semantic state, never a hardcoded filename. Real artwork replaces the files later with no code change.

States: `thinking, action, celebrate, idea, reminder, success, exercise, talking, planning, building, reading, happy`.

An unknown expression falls back to `happy`, never a broken image.

### 6.4 Library registration

A `Bob` definition joins `lib/widgets.ts` under a new `Family` category (current categories are Time, Weather, Planner, Decor). Default size roughly 360x480, aspect locked.

The "do not wallpaper the screen" principle stays authoring guidance, enforced by the curated layouts, not by a code constraint.

---

## 7. Curated layouts

Seeded like dscos's existing `morning` and `desk` layouts, and each one is a normal editable layout.

| Layout | Composed from | Bob | State |
| --- | --- | --- | --- |
| Morning | date, weather, greeting text, Bob | decision → planning | action |
| Today | date, weather, calendar (week), Bob | decision → planning | information |
| Gallery | album slideshow, small date/weather | none | gallery |
| Welcome Home | greeting text, weather, Bob | decision → happy | action |
| Evening | date, weather, quote, Bob | decision → talking | information |
| Weekend | album or countdown, quote, Bob | decision → celebrate | ambient |
| Weather | weather (detailed), UV, sun, Bob | decision → reminder | weather |
| Night | minimal clock/date, dimmed | none | ambient |

The checklists, event lists, and task widgets familyOS uses are intentionally absent. They arrive with calendar and tasks in the next slice, and these layouts already have room for them.

---

## 8. Editor UX

- The **Bob widget** appears in the library under `Family`. Its fields render through the existing inspector field system, including `showWhen` so `expression` only shows when `source = fixed`.
- A new **Experiences panel** sits beside the schedule panel. Slice one is a list editor: add a rule, set conditions (days, time, weather thresholds), pick the target layout, pick Bob's expression, set priority. `schedule-panel.tsx` is the template.
- The editor **preview** calls `POST /api/display/preview` with a simulated clock and shows the resolved layout, Bob, and the reason, so Wednesday 18:15 can be previewed without waiting for it.

---

## 9. Data flow

1. Editor writes `experiences` through the existing mutation routes; `lib/schema.ts` validates it; `mutateStore` persists it in the frame document.
2. The display loads the frame, then polls `GET /api/display/state?frame=<id>` every 30 seconds and on mount.
3. Server: read store, build context (weather from `lib/weather.ts`), evaluate, score against `display_history`, select, append to `display_history`, return `{ decision, context, store }`.
4. `FrameDisplay` renders the decision's layout through `FrameScene`, passing `decision` into the widget context.
5. The decision-aware Bob widget reads `expression` and `speech` from the decision.
6. The screen transitions only when `decision.id` changes.

---

## 10. Fallbacks and error handling

- Weather unavailable: `context.weather` is undefined, weather rules do not match, weather widgets show their existing empty state, time rules still decide.
- No experiences enabled, or no rule matches: fall back to the schedule rule, then the active layout.
- Decision endpoint errors or times out: the display keeps the last good layout and falls back to the client-side `resolveDisplay`.
- A rule pointing at a deleted layout: pruned on store normalize, as schedule rules are pruned today. At runtime an unmatched `layoutId` is skipped.
- Unknown Bob expression: falls back to `happy`.
- Invalid timezone or holiday list: ignored.

---

## 11. Testing

Engine modules are pure and mirror familyOS's tested logic. This slice introduces **Vitest**, scoped to `lib/engine/*` and the precedence resolver. dscos has no test runner today, so this is a new dev dependency and a deliberate decision.

Cases:

- `context`: period boundaries, timezone and weekday, school-day and holiday detection.
- `operators`: every condition type, nested `all`/`any`/`not`.
- `scoring`: formula, weather relevance, repetition ladder.
- `selector`: eligibility, ordering, tie-breaks.
- precedence: experience match beats schedule beats active.
- `decision`: stable `id` for identical inputs.

Runtime evidence complements the unit tests: simulated-time screenshots of Morning, Gallery, Welcome Home, and Evening, and a rain rule firing.

---

## 12. Risks

- dscos builds with `typescript.ignoreBuildErrors: true`. Engine work should not lean on it; tighten it for the new code.
- A server-side weather fetch inside the decision endpoint adds latency. Cache it 10-15 minutes.
- Polling both `/api/store` and `/api/display/state` doubles requests. The decision response carries the store so one poll does both.
- Context must use the frame's timezone, not server UTC.
- `display_history` grows without a retention window.
- Introducing Vitest and `drizzle-kit` expands the toolchain of a project that currently has neither.

---

## 13. Open questions

1. **Retention window for `display_history`.** Starting assumption is 7 days. Revisit once real polling is observed.
2. **Layout deletion and rules.** Prune rules that reference a deleted layout, matching how schedule rules are pruned. Confirm the editor surfaces the pruning.
3. **Timezone source.** Per-frame setting versus a single household setting. Slice one uses a per-frame `experiences.settings.timezone`, defaulting to the server timezone.
4. **Weather threshold defaults.** The seeded rain rule uses 60 percent, matching familyOS. Heat, cold, and UV thresholds are not seeded in this slice.

---

## 14. Acceptance criteria

The slice is done when:

1. `GET /api/display/state` returns a valid `DisplayDecision` through the full context → rules → scoring → selector path.
2. Across a simulated day, the engine selects Morning, Gallery, Welcome Home, and Evening, and the display renders them.
3. A Bob widget set to `decision` shows the expression the rule chose, and one set to `fixed` ignores the decision.
4. The rain rule fires when rain probability exceeds the threshold.
5. With experiences disabled, the frame behaves exactly as it does today.
6. Engine unit tests pass, and a stable decision `id` prevents needless transitions.
