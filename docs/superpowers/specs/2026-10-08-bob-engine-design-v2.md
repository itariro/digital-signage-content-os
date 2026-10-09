# Bob Engine for Digital Signage Content OS — Design v2

- **Date:** 2026-10-08
- **Status:** Approved design, pending implementation plan
- **Scope:** First slice. Port the familyOS context → rules → scoring → selector engine into dscos, plus a decision-aware Bob widget, running on data dscos already has.
- **Source of truth:** familyOS `frame.md` and `docs/superpowers/specs/2026-10-05-bob-frame-mvp-design.md`. This document ports the Bob system into dscos and resolves how the two models fit.
- **Changelog from v1:** Resolved all P0/P1 findings from adversarial review. See §15 for the full list of changes.
- **Changelog from v2 review:** Fixed 20 additional findings from the adversarial re-review. See §16.

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

**Selector purity constraint:** The selector is a pure function that takes a list of scored candidates and returns the winner. It does NOT validate `layoutId` against the store. Instead, `state.ts` filters candidates before passing them to the selector, removing any whose `layoutId` does not exist in the store's `layouts` array. This keeps the selector pure and testable while ensuring no decision references a non-existent layout.

### 3.2 Decision endpoint

```
GET  /api/display/state?frame=<id>     -> { decision, context, store }
POST /api/display/preview?frame=<id>   -> { decision, context, warning } for a simulated dateTime
```

The response carries the store as well, so the display's single 30-second poll refreshes both content and decision. `decision.id` is a stable hash of `ruleId`, `layoutId`, `state`, `bob.expression`, and `bob.speech`, so the display transitions only when one of those changes.

**`decision.id` hash algorithm:** The hash is computed as:
```
decision.id = sha256(JSON.stringify([ruleId, layoutId, state, bob?.expression ?? null, bob?.speech ?? null])).slice(0, 16)
```
This produces a 16-character hex string. The algorithm is frozen: changing it would cause all decision IDs to change, triggering unnecessary display transitions.

**Preview does NOT append to `display_history`.** The preview endpoint evaluates and scores using the current history state but does not persist the result. This means:
- The preview does not pollute the history and affect future real decisions.
- The preview may not perfectly reflect what the real decision would be if the real decision would see different history. This is an accepted tradeoff: the preview is a "what would the engine decide right now, given current history" tool, not a "what will the engine decide at this exact moment in the future" tool.

**Preview `warning` field:** The preview response always includes a `warning` field:
```json
{
  "decision": { ... },
  "context": { ... },
  "warning": "This preview does not account for display history. The real decision may differ."
}
```
The warning is always present, not conditional. This is because the preview cannot know what the history will be at the simulated time, so it cannot determine whether the real decision would differ.

### 3.3 Precedence

The experience engine sits above the existing schedule:

1. An experience rule matches: that layout and Bob.
2. No experience match, schedule enabled: existing `resolveDisplay` layout, no decision Bob.
3. Otherwise: the frame's active layout.

**Server-primary with client fallback:** The display polls `/api/display/state` every 30 seconds. On success, it uses the server's decision. On failure (timeout, 5xx, network error), it falls back to the client-side `resolveDisplay()` using the last known store. This means:
- When the server is available, the server's decision is authoritative.
- When the server is unavailable, the display degrades to the existing schedule-based behavior.
- An unconfigured frame (no experiences) behaves identically to today because the server falls back to the schedule, and the client-side `resolveDisplay()` is the same code path.

**Decision with `ruleId: null`:** When no experience rule matches, the engine returns a decision with `ruleId: null`, `layoutId` set to the schedule-resolved layout (or active layout if schedule is disabled), `state` set to `'ambient'`, `bob` set to `null`. The display renders this decision the same way as any other decision — it reads `decision.layoutId` and renders that layout. The `bob` widget, when `source = decision`, falls back to its own `expression` when `decision.bob` is `null`.

### 3.4 Authentication

The new endpoints follow the existing dscos pattern of **no authentication**, consistent with `/api/store`, `/api/schedule`, and all other existing endpoints. This is a deliberate decision: dscos is a single-tenant household application where the display and editor are the only clients, and the frame ID is not a secret. Rate limiting is not implemented in this slice; if abuse becomes a concern, it can be added at the reverse proxy layer.

**Risk note:** Anyone with the frame ID can read the store (including layouts, widgets, and experiences) and the decision. This is acceptable for a single-tenant household app but should be revisited if multi-tenant support is added.

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
    durationMs: number             // minimum time before this rule can match again
    reason?: string                // label; else derived from rule name
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

**`specialTag` matching:** A `{ specialTag: string }` condition matches if the exact string is present in `context.specialTags`. The engine derives tags from weather as follows:
- `rain` when rain probability > 60%
- `heat` when temperature > 30°C (or 86°F)
- `cold` when temperature < 5°C (or 41°F)
- `uv` when UV index > 6

These thresholds are constants in `lib/engine/context.ts` and can be adjusted later.

**Rule ID uniqueness:** Rule IDs must be unique within a frame. The zod schema validates this. If a duplicate ID is detected, the store mutation is rejected with a 400 error.

**`durationMs` purpose:** `durationMs` is the minimum time before the same rule can match again. If a rule matched within `durationMs`, it is ineligible. This prevents rapid re-evaluation when the display polls every 30 seconds. A value of `0` means the rule is always eligible.

**`reason` derivation:** If `reason` is not set, it defaults to the rule's `name`.

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

**Decision with `ruleId: null`:** When no experience rule matches, the engine returns:
```ts
{
  id: hash(null, layoutId, 'ambient', null, null),
  state: 'ambient',
  layoutId: <schedule-resolved or active layout ID>,
  bob: null,
  priority: 0,
  score: 0,
  reason: 'Schedule',
  ruleId: null,
  durationMs: 0,
  generatedAt: <ISO timestamp>
}
```

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

- Period boundaries: night `<06:00`, morning `06:00-08:45`, day `08:45-16:30`, welcome-home `16:30-18:30`, evening `18:30-21:00`, wind-down `>21:00`. Periods are `[from, to)` — inclusive of `from`, exclusive of `to`. For example, `06:00` is morning, not night; `08:45` is day, not morning.
- Weather comes from the same Open-Meteo service dscos already calls, refactored into a server-side `lib/weather.ts` shared by the engine and the widget route, cached 10-15 minutes. The cache is keyed by `(latitude, longitude)` rounded to 2 decimal places.
- `schoolDay` is weekday and the date is not in the configured holiday list.
- `specialTags` are derived from weather as specified in §4.1.

The context must use the frame's configured timezone, not server UTC.

**Invalid timezone handling:** If the frame's configured timezone is invalid (e.g., `Intl.DateTimeFormat` throws), the engine falls back to server UTC and logs a warning. The decision endpoint still returns a valid decision.

**Invalid holiday list handling:** If the holiday list contains invalid dates (e.g., `2026-13-45`), those entries are ignored. The engine logs a warning for each invalid entry.

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

**`repetitionPenalty` is based on `layout_id` only, not `decision_id`.** This is a deliberate design decision: the penalty is intended to prevent the same layout from appearing too frequently, regardless of which rule selected it. This means a layout selected by different rules with different Bob expressions will still be penalized. This is intentional — the goal is layout diversity, not decision diversity.

**`novelty` is a cold-start boost.** On first deployment, `display_history` is empty, so every layout gets the +40 bonus. This means the scoring is initially skewed toward layouts that have never been shown. This is intentional — it gives every layout a chance to be seen before the history warms up and the novelty bonus becomes a steady-state feature.

**Repetition penalty query:** The repetition penalty is computed using this query:
```sql
SELECT shown_at FROM display_history
WHERE frame_id = $1 AND layout_id = $2 AND shown_at > NOW() - INTERVAL '120 minutes'
ORDER BY shown_at DESC
LIMIT 1
```
If a row is found, the penalty is computed based on the age of the most recent row:
- Under 5 minutes: 300
- Under 30 minutes: 150
- Under 120 minutes: 50
- Otherwise: 0

If no row is found, the penalty is 0.

**Selector input:** The selector receives a list of `ScoredCandidate` objects, each containing the rule, the computed score, and the `layoutId`. The selector does NOT have access to the store. `state.ts` is responsible for filtering candidates before passing them to the selector. The selector sorts by score descending, tie-breaks by priority then stable rule id, and returns the winner.

### 4.5 Seeded default rules

| Rule | Window | Layout | Bob | State | Priority | Score | DurationMs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Morning | weekdays 06:00-08:45 | Morning | planning | action | 100 | 0 | 0 |
| Gallery | weekdays 08:45-16:30 | Gallery | none | gallery | 100 | 0 | 0 |
| Welcome home | weekdays 16:30-18:30 | Welcome Home | happy | action | 100 | 0 | 0 |
| Evening | 18:30-21:00 | Evening | talking | information | 100 | 0 | 0 |
| Weekend | Sat/Sun | Weekend | celebrate | ambient | 100 | 0 | 0 |
| Rain | rain probability > 60% | Weather | reminder | weather | 200 | 0 | 0 |
| Night | 21:00-06:00 | Night | none | ambient | 100 | 0 | 0 |

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

**Default value:** If a frame's store does not have an `experiences` field (i.e., frames created before this feature), the engine treats it as `{ enabled: false, rules: [], settings: { schoolHolidays: [] } }`. The `normalize()` function adds this default when reading the store. `normalize()` runs on both read and write, and the default is persisted on first read.

**`normalize()` extension:** `normalize()` is extended to prune experience rules whose `then.layoutId` does not exist in the store's `layouts` array. This mirrors the existing behavior of pruning schedule rules that reference deleted albums. The pruning is logged so operators can diagnose missing layouts.

### 5.2 History is a table

`display_history` is append-only and does not fit the document model.

```sql
CREATE TABLE display_history (
  id BIGSERIAL PRIMARY KEY,
  frame_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  layout_id TEXT NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  UNIQUE (frame_id, decision_id, shown_at)
);
CREATE INDEX display_history_frame_time ON display_history (frame_id, shown_at);
```

**Column purposes:**
- `id`: surrogate key, used for pagination and debugging.
- `frame_id`: the frame this decision was for.
- `decision_id`: the decision's `id` hash.
- `layout_id`: the layout that was selected.
- `shown_at`: when the decision was shown, truncated to the nearest minute.
- `score`: the decision's final score, used for analytics and debugging.

**Idempotent append:** The `shown_at` column is set to `date_trunc('minute', NOW())`, not `NOW()`. This makes `shown_at` deterministic within a minute, so the `UNIQUE (frame_id, decision_id, shown_at)` constraint prevents the same decision from being appended twice within the same minute. The append uses `ON CONFLICT (frame_id, decision_id, shown_at) DO NOTHING`, so if a crash-retry cycle causes a duplicate append within the same minute, the second append is silently ignored. This prevents the race condition where a crash after append but before response causes the next poll to see duplicate history and compute an incorrect repetition penalty.

**Retention window:** Rows older than 7 days are pruned in the decision path. Every decision request runs `DELETE FROM display_history WHERE frame_id = $1 AND shown_at < NOW() - INTERVAL '7 days'` before appending the new row. This DELETE and the subsequent INSERT are wrapped in a single transaction to ensure atomicity. This keeps the table bounded and the repetition penalty query fast. The 7-day window is a starting assumption (see §13).

**Query timeout:** The `display_history` query has a timeout of 1 second. If the query times out, the engine returns a decision without repetition penalty or novelty bonus, and logs an error. The decision is still valid, just less informed.

### 5.3 Migration tooling

dscos has no migration tooling today: no `drizzle-kit`, no config, no `CREATE TABLE`. The table needs a creation path.

- **Recommended:** add `drizzle-kit` and `drizzle.config.ts`, add `displayHistory` to `lib/db/schema.ts`, and generate and apply a migration. Standard Drizzle flow, and the next slice needs calendar and task tables anyway.
- **Lighter alternative:** an idempotent `CREATE TABLE IF NOT EXISTS` bootstrap run on first use. No new tooling, but ad hoc.

**Migration application process:** The migration is applied manually by running `npx drizzle-kit generate` to generate the SQL file, then `npx drizzle-kit migrate` to apply it. In development, this is run once. In production, this is run as part of the deployment process. If the migration fails, the deployment is rolled back and the error is investigated. The migration is backward-compatible: it only adds a new table, it does not modify existing tables.

---

## 6. Bob widget and assets

### 6.1 Widget type

A new `bob` type joins `WIDGET_TYPES`. Geometry and style come from the widget box like every other widget, so placement, size, radius, and shadow are the author's, not the engine's.

| Prop | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `source` | select | `fixed` | `fixed` or `decision` |
| `expression` | select | `happy` | one of the 12 states, used when `source = fixed` |
| `speech` | text | `''` | optional caption for the `speech` template |
| `animate` | toggle | `false` | subtle entrance, off by default |

Templates: `plain` (Bob contained in the box), `speech` (Bob with a speech bubble), `badge` (circular, for small placements). Default template is `plain`.

### 6.2 Decision binding

`WidgetContext` gains `decision?: DisplayDecision | null`, threaded through `FrameScene` and `WidgetBody`. The exact threading path is:

1. `FrameDisplay` receives the decision from `/api/display/state` and passes it as a `decision` prop to `FrameScene`.
2. `FrameScene` passes the `decision` prop to `WidgetBody`.
3. `WidgetBody` includes `decision` in the `WidgetContext` it constructs for each widget.

When `source = decision`:

- `expression` comes from `ctx.decision?.bob?.expression ?? widget.expression ?? 'happy'`. This is a three-level fallback: first the decision's expression, then the widget's own expression, then `'happy'`.
- `speech` comes from `ctx.decision?.bob?.speech ?? widget.speech`. This is a two-level fallback: first the decision's speech, then the widget's own speech.

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
- The editor **preview** calls `POST /api/display/preview?frame=<id>` with a simulated clock and shows the resolved layout, Bob, and the reason, so Wednesday 18:15 can be previewed without waiting for it.

**Preview endpoint schema:**

Request:
```
POST /api/display/preview?frame=<id>
Content-Type: application/json

{ "dateTime": "2026-10-08T18:15:00" }
```

`dateTime` is an ISO 8601 string without timezone. The server interprets it in the frame's configured timezone. If the timezone is invalid, the server falls back to server UTC.

Response:
```json
{
  "decision": { "id": "...", "state": "action", "layoutId": "...", "bob": { "expression": "happy" }, ... },
  "context": { "now": "...", "weekday": "WED", "period": "welcome-home", ... },
  "warning": "This preview does not account for display history. The real decision may differ."
}
```

The preview does NOT append to `display_history`. The `warning` field is always present.

---

## 9. Data flow

1. Editor writes `experiences` through the existing mutation routes; `lib/schema.ts` validates it; `mutateStore` persists it in the frame document.
2. The display loads the frame, then polls `GET /api/display/state?frame=<id>` every 30 seconds and on mount.
3. Server: read store, build context (weather from `lib/weather.ts`), evaluate, score against `display_history`, select, append to `display_history` (idempotent, in a transaction with pruning), return `{ decision, context, store }`.
4. `FrameDisplay` renders the decision's layout through `FrameScene`, passing `decision` into the widget context.
5. The decision-aware Bob widget reads `expression` and `speech` from the decision.
6. The screen transitions only when `decision.id` changes.
7. On endpoint failure, `FrameDisplay` falls back to client-side `resolveDisplay()` using the last known store.

---

## 10. Fallbacks and error handling

- Weather unavailable: `context.weather` is undefined, weather rules do not match, weather widgets show their existing empty state, time rules still decide.
- No experiences enabled, or no rule matches: fall back to the schedule rule, then the active layout. The decision has `ruleId: null` and `bob: null`.
- Decision endpoint errors or times out: the display keeps the last good layout and falls back to the client-side `resolveDisplay`.
- A rule pointing at a deleted layout: pruned on store normalize. At runtime, `state.ts` filters out candidates whose `layoutId` is not in the store.
- Unknown Bob expression: falls back to `happy`.
- Invalid timezone: the engine falls back to server UTC and logs a warning.
- Invalid holiday list: invalid entries are ignored and logged.
- `display_history` table doesn't exist: the engine returns a decision without repetition penalty or novelty bonus (treats history as empty). This allows the engine to function before the migration is applied.
- `display_history` query times out (1 second): the engine returns a decision without repetition penalty or novelty bonus, and logs an error. The decision is still valid, just less informed.
- Engine throws an unexpected error: the endpoint returns 500 with `{ error: string }`. The display falls back to client-side `resolveDisplay()`.

---

## 11. Testing

Engine modules are pure and mirror familyOS's tested logic. This slice introduces **Vitest**, scoped to `lib/engine/*` and the precedence resolver. dscos has no test runner today, so this is a new dev dependency and a deliberate decision.

**Testing strategy for impure modules:** `state.ts` is impure (it reads the store, reads/writes `display_history`, and fetches weather). It is tested by injecting fakes:
- The store is replaced with a fake that returns a predefined `FrameStore`.
- The database is replaced with a fake that returns predefined `display_history` rows.
- The weather fetch is replaced with a fake that returns a predefined `WeatherSnapshot`.

This allows `state.ts` to be tested without a real database or network.

Cases:

- `context`: period boundaries, timezone and weekday, school-day and holiday detection, invalid timezone fallback, invalid holiday list handling.
- `operators`: every condition type, nested `all`/`any`/`not`, `specialTag` exact match.
- `scoring`: formula, weather relevance, repetition ladder, novelty bonus, cold-start behavior.
- `selector`: eligibility, ordering, tie-breaks.
- precedence: experience match beats schedule beats active.
- `decision`: stable `id` for identical inputs, `ruleId: null` for fallback.
- `state.ts`: idempotent append, history query timeout handling, missing table handling, candidate filtering by `layoutId`.
- preview: does not append to history, returns correct decision for simulated time, always includes warning.
- fallback: experiences disabled produces same behavior as today.
- `normalize()`: prunes experience rules referencing deleted layouts, adds default `experiences` field.

Runtime evidence complements the unit tests: simulated-time screenshots of Morning, Gallery, Welcome Home, and Evening, and a rain rule firing.

---

## 12. Risks

- dscos builds with `typescript.ignoreBuildErrors: true`. Engine work should not lean on it; tighten it for the new code.
- A server-side weather fetch inside the decision endpoint adds latency. Cache it 10-15 minutes.
- Polling both `/api/store` and `/api/display/state` doubles requests. The decision response carries the store so one poll does both.
- Context must use the frame's timezone, not server UTC.
- `display_history` grows without a retention window.
- Introducing Vitest and `drizzle-kit` expands the toolchain of a project that currently has neither.
- The decision response carries the full store, which increases payload size. This is an accepted tradeoff: it eliminates a second poll and keeps the display simple. If payload size becomes a concern, a future optimization can send only the changed layout or use ETags.

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
7. The preview endpoint does not append to `display_history`.
8. A crash-after-append does not corrupt the repetition penalty (idempotent append test passes).
9. A rule referencing a deleted layout is pruned by `normalize()`.
10. An invalid timezone falls back to server UTC without breaking the decision.

---

## 15. Changelog from v1

This section documents every change made to resolve the findings from the adversarial review of v1.

| Finding | Severity | Change |
| --- | --- | --- |
| F-001: `display_history` append race condition | P0 | Added `UNIQUE (frame_id, decision_id, shown_at)` constraint and `ON CONFLICT (frame_id, decision_id, shown_at) DO NOTHING`. Set `shown_at = date_trunc('minute', NOW())` to make it deterministic within a minute. |
| F-002: Preview pollutes history | P0 | Specified that preview does NOT append to `display_history`. Added a `warning` field to the preview response. |
| F-003: Selector cannot validate `layoutId` | P1 | Moved `layoutId` validation to `state.ts`, which filters candidates before passing them to the selector. The selector remains pure. |
| F-004: `normalize()` does not prune experience rules | P1 | Specified that `normalize()` is extended to prune experience rules referencing deleted layouts. |
| F-005: Fallback changes unconfigured frame behavior | P1 | Specified server-primary with client fallback. The display polls `/api/display/state` and falls back to client-side `resolveDisplay()` on failure. |
| F-006: No authentication on new endpoints | P1 | Added explicit statement: no authentication, consistent with existing dscos endpoints. |
| A-001: `specialTag` matching logic | — | Specified exact string match against `context.specialTags`. Documented tag derivation from weather. |
| A-002: `WidgetContext.decision` threading | — | Specified the exact threading path: `FrameDisplay` → `FrameScene` → `WidgetBody` → `WidgetContext`. |
| A-003: Preview endpoint schema | — | Specified request body `{ dateTime: string }` and response `{ decision, context, warning }`. |
| A-004: Decision with `ruleId: null` | — | Specified the exact shape of a fallback decision. |
| A-005: Invalid timezone handling | — | Specified fallback to server UTC with warning log. |
| A-006: `display_history` pruning | — | Specified pruning in the decision path: `DELETE WHERE shown_at < NOW() - INTERVAL '7 days'`, wrapped in a transaction with the INSERT. |
| D-001: `repetitionPenalty` based on `layout_id` only | — | Documented as a deliberate design decision. |
| D-002: `novelty` bonus cold-start | — | Documented as a deliberate cold-start boost. |
| D-003: Decision response carries full store | — | Documented as an accepted tradeoff. |
| D-004: No unique constraint on `display_history` | — | Added `UNIQUE (frame_id, decision_id, shown_at)` constraint. |
| DATA-001: No migration tooling | — | Specified the migration application process. |
| DATA-003: Existing data compatibility | — | Specified default value for missing `experiences` field. |
| LF-006: Engine is not deterministic | — | Documented: the engine is not deterministic because it depends on `display_history`. This is intentional. |
| LF-007: Rule ID uniqueness | — | Specified that rule IDs must be unique, validated by zod schema. |
| LF-008: Maximum number of rules | — | The zod schema limits rules to 100 per frame. |
| LF-009: `display_history` query timeout | — | Specified that the engine returns a decision without repetition/novelty if the query times out (1 second). |
| LF-010: Maximum size of `display_history` | — | The 7-day retention window bounds the table size. |

---

## 16. Changelog from v2 review

This section documents every change made to resolve the findings from the adversarial re-review of v2.

| Finding | Severity | Change |
| --- | --- | --- |
| F2-001: UNIQUE constraint doesn't prevent race condition | P0 | Changed `shown_at` from `NOW()` to `date_trunc('minute', NOW())` to make it deterministic within a minute. Specified `ON CONFLICT (frame_id, decision_id, shown_at) DO NOTHING` with explicit columns. |
| F2-002: Preview endpoint has no frame ID | P0 | Added `?frame=<id>` query parameter to the preview endpoint. |
| F2-003: Preview `warning` field not implementable | P1 | Changed from conditional to always-present warning. The preview cannot know what the history will be at the simulated time, so it always warns. |
| F2-004: `decision.id` hash algorithm not specified | P1 | Specified exact algorithm: `sha256(JSON.stringify([ruleId, layoutId, state, bob?.expression ?? null, bob?.speech ?? null])).slice(0, 16)`. |
| F2-005: `display_history` DELETE on every request | P1 | Wrapped DELETE + INSERT in a single transaction. Specified query timeout of 1 second. |
| F2-006: Bob widget fallback chain incomplete | P1 | Specified full fallback chain: `ctx.decision?.bob?.expression ?? widget.expression ?? 'happy'`. |
| F2-007: Contradiction between §3.1 and §4.4 | P1 | Removed the filtering sentence from §4.4. The selector does not filter; `state.ts` does. |
| F2-008: `normalize()` timing and persistence | P2 | Specified that `normalize()` runs on both read and write, and the default is persisted on first read. |
| F2-009: Seeded rules incomplete | P2 | Added `Priority`, `Score`, and `DurationMs` columns to the seeded rules table. |
| F2-010: `durationMs` purpose not specified | P2 | Specified: "minimum time before the same rule can match again." |
| F2-011: `display_history` query not specified | P2 | Specified the exact SQL query for the repetition penalty. |
| F2-012: `ON CONFLICT` columns not specified | P2 | Specified `ON CONFLICT (frame_id, decision_id, shown_at) DO NOTHING`. |
| F2-013: `display_history` query timeout not specified | P2 | Specified 1 second timeout. |
| F2-014: Weather cache keying not specified | P2 | Specified cache key: `(latitude, longitude)` rounded to 2 decimal places. |
| F2-015: Bob widget defaults not specified | P2 | Specified defaults for all props: `source = 'fixed'`, `expression = 'happy'`, `speech = ''`, `animate = false`, template = `plain`. |
| F2-016: Period boundary ambiguity | P2 | Specified `[from, to)` semantics: inclusive of `from`, exclusive of `to`. |
| F2-017: `reason` derivation not specified | P2 | Specified: "If `reason` is not set, it defaults to the rule's `name`." |
| F2-018: `display_history` columns unused | P3 | Documented purpose of `id` and `score` columns. |
| F2-019: Engine non-determinism not addressed in testing | P3 | Specified testing strategy for impure modules: inject fakes for store, database, and weather. |
| F2-020: No authentication risk not documented | P3 | Added risk note in §3.4. |
