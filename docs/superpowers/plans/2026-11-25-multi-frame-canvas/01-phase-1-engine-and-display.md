# Multi-frame canvas: phase 1, engine and display runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the pure canvas engine, `canvas_state` persistence, the additive sync protocol, and a frame display that plays a deployed canvas in sync, with a multi-window dev harness to prove it.

**Architecture:** Scenes are pure functions of synced time in canvas coordinates. Every frame gets the same deployment snapshot plus a clock offset, computes the same scene state, and draws only its slot window. Canvas data travels in its own `canvas_state` row over pull; it never enters the frame document.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, zod 4, drizzle (Postgres and SQLite), SWR, Vitest (node), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md`.
**Assessment and shared contracts:** `docs/superpowers/plans/2026-11-25-multi-frame-canvas/00-assessment.md`.

**Before writing any route or page:** read the relevant guide under `node_modules/next/dist/docs/` (route handlers and pages). This Next.js is not the version in training data.

---

## File map for this phase

Create:

```
lib/widget-style-schema.ts
lib/canvas/schema.ts
lib/canvas/math.ts
lib/canvas/prng.ts
lib/canvas/geometry.ts
lib/canvas/clock.ts
lib/canvas/takeover.ts
lib/canvas/scheduler.ts
lib/canvas/clock-service.ts
lib/canvas/reporter.ts
lib/canvas/poll.ts
lib/canvas/state-store.ts
lib/canvas/scenes/types.ts
lib/canvas/scenes/marquee.ts
lib/canvas/scenes/bounce.ts
lib/canvas/scenes/pong.ts
lib/canvas/scenes/sync-test.ts
lib/canvas/scenes/registry.ts
lib/canvas/__tests__/{geometry,prng,scheduler,clock,takeover,schema,sync-test,marquee,bounce,pong,continuity,poll}.test.ts
components/frame/canvas/canvas-stage.tsx
components/frame/canvas/canvas-frame-scene.tsx
components/frame/canvas/identify-overlay.tsx
components/frame/canvas/use-canvas-clock.ts
components/frame/canvas/scenes/{marquee,bounce,pong,sync-test}.tsx
app/api/time/route.ts
app/api/canvas/state/route.ts
app/api/canvas/report/route.ts
app/dev/canvas-wall/page.tsx
app/dev/canvas-wall/harness.tsx
```

Modify:

```
lib/types.ts
lib/schema.ts
lib/albums.ts
lib/store.ts
lib/db/schema.pg.ts
lib/db/schema.sqlite.ts
lib/db/__tests__/schema.sqlite.test.ts
drizzle/sqlite/0000_init.sql
lib/sync/types.ts
lib/sync/server.ts
lib/sync/client.ts
app/api/sync/pull/route.ts
lib/lifecycle/index.ts
components/frame/frame-display.tsx
.env.example
docs/operations.md
docs/kiosk-cli.md
```

---

## Preflight

- [ ] **Step 1: Confirm the worktree is isolated and current**

Run:
```bash
git rev-parse --show-toplevel
git branch --show-current
git log --oneline -1 origin/main
```
Expected: a path under a worktree directory, not the main checkout; a branch other than `main`; `origin/main` is the base you branched from.

- [ ] **Step 2: Run the baseline checks**

Run:
```bash
pnpm test
npx tsc --noEmit
pnpm build
```
Expected: tests pass, TypeScript prints nothing, build succeeds. On the assessment baseline that is 658 passed / 7 skipped. If any fails, stop and report a baseline problem.

- [ ] **Step 3: Skim open PRs for overlap**

Run:
```bash
gh pr list --state open --json number --jq '.[].number' | while read -r n; do gh pr diff "$n" --name-only; done
```
Expected: no open PR touching `lib/canvas/`, `canvas_state`, or the sync pull path. On overlap, stop and ask for direction.

---

### Task 1: Domain types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `'canvas'` to the theme and presentation unions**

Replace:
```ts
export const ALBUM_THEMES = ['movies', 'tv', 'books', 'music', 'photos', 'map-art'] as const
export type AlbumTheme = (typeof ALBUM_THEMES)[number]

export const PRESENTATIONS = ['fill', 'poster', 'book', 'vinyl', 'gallery', 'mosaic', 'reveal'] as const
```
with:
```ts
export const ALBUM_THEMES = ['movies', 'tv', 'books', 'music', 'photos', 'map-art', 'canvas'] as const
export type AlbumTheme = (typeof ALBUM_THEMES)[number]

export const PRESENTATIONS = ['fill', 'poster', 'book', 'vinyl', 'gallery', 'mosaic', 'reveal', 'canvas'] as const
```

Keep `map-art` in both lists. Appending is the whole change.

- [ ] **Step 2: Add the canvas types**

Insert this block after the existing `Layout` type and before `Preset`:

```ts
// ---------------------------------------------------------------------------
// Multi-frame canvas
// ---------------------------------------------------------------------------

export type LayoutKind = 'frame' | 'canvas'
export type CanvasArrangement = 'row' | 'column' | 'grid'

export type CanvasSlot = {
  id: string
  frameId: string | null
  label?: string
  offset: { x: number; y: number }
  scale: number
}

export type CanvasConfig = {
  arrangement: CanvasArrangement
  gridColumns?: number
  gap: number
  align: Align
  slots: CanvasSlot[]
  background: string
  markers: 'identify' | 'always' | 'never'
  notifications: 'suppress' | 'show'
  nightMode: 'inherit' | 'ignore'
  maxFps: 15 | 24 | 30 | 60
}

export type CanvasSceneType = 'marquee' | 'bounce' | 'pong' | 'sync-test'

export type MarqueeStrip = {
  lengthPx: number
  crossPx: number
  segments: { text: string; at: number; w: number }[]
}

export type MarqueeConfig = {
  lines: string[]
  layout: 'line' | 'block'
  separator: string
  direction: 'left' | 'right' | 'up' | 'down'
  orientation: 'upright' | 'rotated'
  speed: number
  repeat: boolean
  gap: number
  lineHeight: number
  fontSize: number
  align: Align
  crossOffset: number
  style: WidgetStyle
  strip?: MarqueeStrip
}

export type BounceLogo =
  | { kind: 'text'; text: string; shape: 'none' | 'ellipse' | 'pill' | 'rounded'; style: WidgetStyle; w: number; h: number }
  | { kind: 'image'; src: string; w: number; h: number }

export type BounceConfig = {
  logo: BounceLogo
  speed: number
  angleDeg: number | null
  startMode: 'seed' | 'center'
  tint: { mode: 'cycle' | 'fixed' | 'none'; colors: string[]; fixed: string }
  cornerCelebration: boolean
  trail: { enabled: boolean; length: number; spacingMs: number }
}

export type PongConfig = {
  axis: 'auto' | 'horizontal' | 'vertical'
  paddle: { w: number; h: number; inset: number }
  ballSize: number
  baseSpeed: number
  rallyHits: [number, number]
  pointsPerMatch: number
  serveDelayMs: number
  pointPauseMs: number
  showScore: boolean
  colors: { ball: string; paddles: string; net: string; text: string }
  scoreStyle: WidgetStyle
}

export type SyncTestConfig = {
  periodSec: number
  showGrid: boolean
  showBezels: boolean
}

export type CanvasSceneBase = {
  id: string
  name: string
  enabled: boolean
  durationSec: number
  seed: number
}

export type CanvasScene =
  | (CanvasSceneBase & { type: 'marquee'; config: MarqueeConfig })
  | (CanvasSceneBase & { type: 'bounce'; config: BounceConfig })
  | (CanvasSceneBase & { type: 'pong'; config: PongConfig })
  | (CanvasSceneBase & { type: 'sync-test'; config: SyncTestConfig })

export type DeploymentAlbum = {
  id: string
  name: string
  scenes: CanvasScene[]
  order: 'sequence' | 'shuffle'
  crossfadeMs: number
}

export type CanvasDeployment = {
  canvasId: string
  name: string
  revision: number
  effectiveAt: number
  releaseAt: number | null
  slotId: string
  config: CanvasConfig
  album: DeploymentAlbum | null
}

export type CanvasIdentify = {
  until: number
  canvasName: string
  frameId: string
  label: string | null
  marker: number
  count: number
}

export type CanvasState = {
  v: 1
  active: CanvasDeployment | null
  pending: CanvasDeployment | null
  identify: CanvasIdentify | null
}
```

- [ ] **Step 3: Extend `Slideshow`, `Album` and `Layout`**

Add to `Slideshow`:
```ts
  canvas?: { crossfadeMs: number }
```
Add to `Album`:
```ts
  scenes?: CanvasScene[]
```
Add to `Layout`:
```ts
  kind?: LayoutKind
  canvas?: CanvasConfig
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `lib/albums.ts` from the missing `Record<AlbumTheme, ...>` entries. That is the next task. If there are other errors, fix them before continuing.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(canvas): add canvas domain types"
```

---

### Task 2: Extract widget-style schema (break the import cycle)

Scene configs reuse `WidgetStyle`. Scene modules must validate themselves, and `lib/schema.ts` must validate albums that contain scenes. Without a separate module those two files import each other.

**Files:**
- Create: `lib/widget-style-schema.ts`
- Modify: `lib/schema.ts`

- [ ] **Step 1: Create the new module**

Create `lib/widget-style-schema.ts` with exactly the style primitives currently in `lib/schema.ts`:

```ts
import { z } from 'zod'

export const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

const gradientDefSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().min(-360).max(720),
  stops: z.array(z.object({ color: hex, position: z.number().min(0).max(100) })).min(2).max(8),
})

const imageFillDefSchema = z.object({
  url: z.string().min(1).max(600).refine((v) => v.startsWith('/') || v.startsWith('http://') || v.startsWith('https://'), 'Invalid image'),
  fit: z.enum(['cover', 'contain', 'repeat']),
  scale: z.number().min(10).max(400),
  position: z.number().min(0).max(100),
})

const textFillSchema = z.union([
  z.object({ kind: z.literal('solid'), color: hex }),
  z.object({ kind: z.literal('gradient'), gradient: gradientDefSchema }),
  z.object({ kind: z.literal('image'), image: imageFillDefSchema }),
])

const textStrokeCfgSchema = z.object({
  enabled: z.boolean(),
  color: hex,
  thickness: z.number().min(0).max(24),
  opacity: z.number().min(0).max(100),
  align: z.enum(['inside', 'outside', 'center']),
})

const lightingShadowSchema = z.object({
  preset: z.enum(['none', 'drop', 'contact', 'long', 'curved']),
  distance: z.number().min(0).max(120),
  blur: z.number().min(0).max(120),
  opacity: z.number().min(0).max(100),
  angle: z.number().min(-360).max(720),
  color: hex,
  steps: z.number().int().min(1).max(200).optional(),
  spread: z.number().min(0).max(80).optional(),
})

export const widgetStyleSchema = z.object({
  fontFamily: z.string().min(1).max(80),
  fontWeight: z.number().int().min(100).max(900),
  letterSpacing: z.number().min(-20).max(60),
  align: z.enum(['start', 'center', 'end']),
  color: hex,
  accent: hex,
  bg: hex,
  bgOpacity: z.number().min(0).max(100),
  blur: z.number().min(0).max(60),
  radius: z.number().min(0).max(1000),
  stroke: hex,
  strokeWidth: z.number().min(0).max(40),
  textStroke: z.number().min(0).max(20),
  opacity: z.number().min(0).max(100),
  shadow: z.boolean(),
  fill: textFillSchema.optional(),
  textStrokeCfg: textStrokeCfgSchema.optional(),
  lightingShadow: lightingShadowSchema.optional(),
})
```

- [ ] **Step 2: Replace the duplicated block in `lib/schema.ts`**

At the top of `lib/schema.ts`, add:
```ts
import { hex, widgetStyleSchema } from './widget-style-schema'
export { widgetStyleSchema } from './widget-style-schema'
```

Then delete the block that starts at `const hex = z.string().regex(...)` and ends at the closing `})` of `widgetStyleSchema`. Everything from `const gradientDefSchema` through `lightingShadowSchema` goes with it. Do not delete `widgetSchema`, `stickerLayerSchema` or anything below.

- [ ] **Step 3: Verify imports still resolve**

Run: `npx tsc --noEmit`
Expected: only the `lib/albums.ts` map errors from Task 1 remain. `iris` and every existing importer of `widgetStyleSchema` from `@/lib/schema` still works through the re-export.

- [ ] **Step 4: Run the schema and widget tests**

Run: `pnpm vitest run lib/__tests__ tests/editor-shell.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/widget-style-schema.ts lib/schema.ts
git commit -m "refactor(schema): extract widget style schema module"
```

---

### Task 3: Canvas zod schemas

**Files:**
- Create: `lib/canvas/schema.ts`
- Modify: `lib/schema.ts`
- Test: `lib/canvas/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/canvas/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { albumUpdateSchema, layoutInputSchema } from '@/lib/schema'
import { defaultSlideshow } from '@/lib/albums'
import { DEFAULT_STYLE } from '@/lib/widgets'
import { canvasConfigSchema, canvasSceneSchema } from '@/lib/canvas/schema'

const slot = (id: string, frameId: string | null) => ({
  id,
  frameId,
  offset: { x: 0, y: 0 },
  scale: 1,
})

const config = {
  arrangement: 'row' as const,
  gap: 0,
  align: 'center' as const,
  slots: [slot('a', 'frame-a'), slot('b', 'frame-b')],
  background: '#000000',
  markers: 'identify' as const,
  notifications: 'suppress' as const,
  nightMode: 'inherit' as const,
  maxFps: 30 as const,
}

const settings = {
  resolution: '1080x1920' as const,
  background: '',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric' as const,
  snap: true,
  gridSize: 20,
  albumId: null,
}

// Inline fixtures: this suite must not import the scene registry (Task 17) or
// geometry (Task 9), which are created later in the plan.
const scenes = {
  marquee: {
    id: 's-marquee', name: 'Marquee', enabled: true, durationSec: 60, seed: 1,
    type: 'marquee' as const,
    config: {
      lines: ['Hello, wall'], layout: 'line' as const, separator: '   •   ',
      direction: 'left' as const, orientation: 'upright' as const, speed: 240,
      repeat: true, gap: 600, lineHeight: 200, fontSize: 160, align: 'center' as const,
      crossOffset: 0, style: DEFAULT_STYLE,
    },
  },
  bounce: {
    id: 's-bounce', name: 'Bounce', enabled: true, durationSec: 120, seed: 1,
    type: 'bounce' as const,
    config: {
      logo: { kind: 'text' as const, text: 'DVD', shape: 'ellipse' as const, style: DEFAULT_STYLE, w: 300, h: 140 },
      speed: 280, angleDeg: null, startMode: 'seed' as const,
      tint: { mode: 'none' as const, colors: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6'], fixed: '#ffffff' },
      cornerCelebration: true, trail: { enabled: false, length: 0, spacingMs: 80 },
    },
  },
  pong: {
    id: 's-pong', name: 'Pong', enabled: true, durationSec: 300, seed: 1,
    type: 'pong' as const,
    config: {
      axis: 'auto' as const, paddle: { w: 24, h: 220, inset: 40 }, ballSize: 28,
      baseSpeed: 900, rallyHits: [2, 7] as [number, number], pointsPerMatch: 7,
      serveDelayMs: 900, pointPauseMs: 1200, showScore: true,
      colors: { ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
      scoreStyle: DEFAULT_STYLE,
    },
  },
  'sync-test': {
    id: 's-sync', name: 'Sync test', enabled: true, durationSec: 30, seed: 1,
    type: 'sync-test' as const,
    config: { periodSec: 4, showGrid: true, showBezels: true },
  },
}

describe('canvas config schema', () => {
  it('accepts a valid config and fills defaults', () => {
    const parsed = canvasConfigSchema.safeParse({ arrangement: 'row', slots: [slot('a', null)] })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.gap).toBe(0)
      expect(parsed.data.background).toBe('#000000')
      expect(parsed.data.maxFps).toBe(30)
    }
  })

  it('rejects duplicate slot ids and duplicate frame ids', () => {
    expect(canvasConfigSchema.safeParse({ ...config, slots: [slot('a', 'f'), slot('a', 'g')] }).success).toBe(false)
    expect(canvasConfigSchema.safeParse({ ...config, slots: [slot('a', 'f'), slot('b', 'f')] }).success).toBe(false)
  })

  it('rejects more than 16 slots', () => {
    const slots = Array.from({ length: 17 }, (_, i) => slot(`s${i}`, `f${i}`))
    expect(canvasConfigSchema.safeParse({ ...config, slots }).success).toBe(false)
  })
})

describe('canvas scene schema', () => {
  it('accepts a valid scene of every type', () => {
    for (const type of ['marquee', 'bounce', 'pong', 'sync-test'] as const) {
      expect(canvasSceneSchema.safeParse(scenes[type]).success).toBe(true)
    }
  })

  it('rejects an image logo that is not a small png/webp/jpeg data uri', () => {
    const scene = scenes.bounce
    if (scene.type !== 'bounce') throw new Error('wrong scene')
    expect(canvasSceneSchema.safeParse({ ...scene, config: { ...scene.config, logo: { kind: 'image', src: 'https://example.com/x.png', w: 100, h: 100 } } }).success).toBe(false)
    expect(canvasSceneSchema.safeParse({ ...scene, config: { ...scene.config, logo: { kind: 'image', src: 'data:image/png;base64,AAAA', w: 100, h: 100 } } }).success).toBe(true)
  })

  it('rejects a marquee strip whose segments overflow its length', () => {
    const scene = scenes.marquee
    if (scene.type !== 'marquee') throw new Error('wrong scene')
    const strip = { lengthPx: 100, crossPx: 20, segments: [{ text: 'x', at: 90, w: 20 }] }
    expect(canvasSceneSchema.safeParse({ ...scene, config: { ...scene.config, strip } }).success).toBe(false)
  })

  it('rejects pong rallies where max is not at least min + 1', () => {
    const scene = scenes.pong
    if (scene.type !== 'pong') throw new Error('wrong scene')
    expect(canvasSceneSchema.safeParse({ ...scene, config: { ...scene.config, rallyHits: [4, 4] } }).success).toBe(false)
  })
})

describe('layout and album invariants', () => {
  it('requires canvas config and empty widgets when kind is canvas', () => {
    expect(layoutInputSchema.safeParse({ name: 'c', kind: 'canvas', widgets: [], settings }).success).toBe(false)
    expect(layoutInputSchema.safeParse({ name: 'c', kind: 'canvas', canvas: config, widgets: [], settings }).success).toBe(true)
    expect(layoutInputSchema.safeParse({ name: 'c', kind: 'frame', canvas: config, widgets: [], settings }).success).toBe(false)
    expect(layoutInputSchema.safeParse({ name: 'c', canvas: config, widgets: [], settings }).success).toBe(false)
  })

  it('requires scenes and no items for a canvas album', () => {
    const base = {
      name: 'Canvas',
      theme: 'canvas' as const,
      items: [],
      slideshow: { ...defaultSlideshow('canvas') },
    }
    expect(albumUpdateSchema.safeParse(base).success).toBe(false)

    const scene = scenes['sync-test']
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene] }).success).toBe(true)
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene], items: [{ id: 'x', image: '/x.png', sourceUrl: '', title: 'x', subtitle: '', year: '' }] }).success).toBe(false)
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene], slideshow: { ...base.slideshow, transition: 'fade' } }).success).toBe(false)
  })

  it('rejects scenes on a non-canvas album', () => {
    const scene = scenes['sync-test']
    const base = { name: 'Photos', theme: 'photos' as const, items: [], slideshow: { ...defaultSlideshow('photos') } }
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm vitest run lib/canvas/__tests__/schema.test.ts`
Expected: FAIL with "Cannot find module '@/lib/canvas/schema'".

- [ ] **Step 3: Write `lib/canvas/schema.ts`**

```ts
import { z } from 'zod'
import { hex, widgetStyleSchema } from '@/lib/widget-style-schema'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

const MAX_LOGO_BYTES = 200 * 1024

export function base64Bytes(value: string): number {
  const clean = value.replace(/\s+/g, '')
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - pad
}

const imageDataUri = z
  .string()
  .max(300_000)
  .refine((value) => {
    const match = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value)
    if (!match) return false
    const bytes = base64Bytes(match[2])
    return bytes > 0 && bytes <= MAX_LOGO_BYTES
  }, 'Use a PNG, WebP or JPEG data URI under 200 KB')

const stripSegmentSchema = z.object({
  text: z.string().max(300),
  at: z.number().min(0).max(32000),
  w: z.number().min(0).max(32000),
})

export const marqueeStripSchema = z
  .object({
    lengthPx: z.number().min(1).max(32000),
    crossPx: z.number().min(0).max(32000),
    segments: z.array(stripSegmentSchema).max(400),
  })
  .superRefine((strip, ctx) => {
    let previous = -1
    strip.segments.forEach((segment, index) => {
      if (segment.at < previous) {
        ctx.addIssue({ code: 'custom', message: 'Strip segments must be ordered', path: ['segments', index, 'at'] })
      }
      previous = segment.at
      if (segment.at + segment.w > strip.lengthPx + 0.5) {
        ctx.addIssue({ code: 'custom', message: 'Strip segment overflows lengthPx', path: ['segments', index] })
      }
    })
  })

export const marqueeConfigSchema = z.object({
  lines: z.array(z.string().max(300)).min(1).max(200),
  layout: z.enum(['line', 'block']).default('line'),
  separator: z.string().max(20).default('   •   '),
  direction: z.enum(['left', 'right', 'up', 'down']).default('left'),
  orientation: z.enum(['upright', 'rotated']).default('upright'),
  speed: z.number().min(20).max(4000).default(240),
  repeat: z.boolean().default(true),
  gap: z.number().min(0).max(20000).default(600),
  lineHeight: z.number().min(16).max(1600).default(200),
  fontSize: z.number().min(16).max(1600).default(160),
  align: z.enum(['start', 'center', 'end']).default('center'),
  crossOffset: z.number().min(-4000).max(4000).default(0),
  style: widgetStyleSchema,
  strip: marqueeStripSchema.optional(),
})

const bounceTextLogoSchema = z.object({
  kind: z.literal('text'),
  text: z.string().min(1).max(40),
  shape: z.enum(['none', 'ellipse', 'pill', 'rounded']),
  style: widgetStyleSchema,
  w: z.number().min(16).max(4000),
  h: z.number().min(16).max(4000),
})

const bounceImageLogoSchema = z.object({
  kind: z.literal('image'),
  src: imageDataUri,
  w: z.number().min(16).max(4000),
  h: z.number().min(16).max(4000),
})

export const bounceConfigSchema = z.object({
  logo: z.discriminatedUnion('kind', [bounceTextLogoSchema, bounceImageLogoSchema]),
  speed: z.number().min(40).max(3000).default(280),
  angleDeg: z.number().min(5).max(85).nullable().default(null),
  startMode: z.enum(['seed', 'center']).default('seed'),
  tint: z
    .object({
      mode: z.enum(['cycle', 'fixed', 'none']).default('none'),
      colors: z.array(hex).min(2).max(12).default(['#e11d48', '#f59e0b', '#22c55e', '#3b82f6']),
      fixed: hex.default('#ffffff'),
    })
    .default({ mode: 'none', colors: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6'], fixed: '#ffffff' }),
  cornerCelebration: z.boolean().default(true),
  trail: z
    .object({ enabled: z.boolean().default(false), length: z.number().int().min(0).max(12).default(0), spacingMs: z.number().int().min(16).max(1000).default(80) })
    .default({ enabled: false, length: 0, spacingMs: 80 }),
})

export const pongConfigSchema = z.object({
  axis: z.enum(['auto', 'horizontal', 'vertical']).default('auto'),
  paddle: z
    .object({ w: z.number().min(8).max(200), h: z.number().min(20).max(800), inset: z.number().min(0).max(400) })
    .default({ w: 24, h: 220, inset: 40 }),
  ballSize: z.number().min(8).max(200).default(28),
  baseSpeed: z.number().min(100).max(5000).default(900),
  rallyHits: z.tuple([z.number().int().min(1).max(20), z.number().int().min(2).max(21)]),
  pointsPerMatch: z.number().int().min(3).max(21).default(7),
  serveDelayMs: z.number().int().min(0).max(5000).default(900),
  pointPauseMs: z.number().int().min(0).max(5000).default(1200),
  showScore: z.boolean().default(true),
  colors: z
    .object({ ball: hex, paddles: hex, net: hex, text: hex })
    .default({ ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' }),
  scoreStyle: widgetStyleSchema,
}).superRefine((config, ctx) => {
  if (config.rallyHits[1] < config.rallyHits[0] + 1) {
    ctx.addIssue({ code: 'custom', message: 'rallyHits max must be at least min + 1', path: ['rallyHits'] })
  }
})

export const syncTestConfigSchema = z.object({
  periodSec: z.number().min(1).max(60).default(4),
  showGrid: z.boolean().default(true),
  showBezels: z.boolean().default(true),
})

export const canvasSlotSchema = z.object({
  id: z.string().min(1).max(40),
  frameId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).nullable(),
  label: z.string().max(40).optional(),
  offset: z.object({ x: z.number().min(-8000).max(8000), y: z.number().min(-8000).max(8000) }).default({ x: 0, y: 0 }),
  scale: z.number().min(0.25).max(4).default(1),
})

export const canvasConfigSchema = z
  .object({
    arrangement: z.enum(['row', 'column', 'grid']),
    gridColumns: z.number().int().min(1).max(8).optional(),
    gap: z.number().min(0).max(600).default(0),
    align: z.enum(['start', 'center', 'end']).default('center'),
    slots: z.array(canvasSlotSchema).min(1).max(16),
    background: hex.default('#000000'),
    markers: z.enum(['identify', 'always', 'never']).default('identify'),
    notifications: z.enum(['suppress', 'show']).default('suppress'),
    nightMode: z.enum(['inherit', 'ignore']).default('inherit'),
    maxFps: z.union([z.literal(15), z.literal(24), z.literal(30), z.literal(60)]).default(30),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>()
    const frames = new Set<string>()
    config.slots.forEach((slot, index) => {
      if (ids.has(slot.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate slot id', path: ['slots', index, 'id'] })
      ids.add(slot.id)
      if (slot.frameId) {
        if (frames.has(slot.frameId)) ctx.addIssue({ code: 'custom', message: 'Frame appears twice', path: ['slots', index, 'frameId'] })
        frames.add(slot.frameId)
      }
    })
  })

const sceneBaseShape = {
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  enabled: z.boolean(),
  durationSec: z.number().min(5).max(86400),
  seed: z.number().int().min(-2147483648).max(2147483647),
}

export const canvasSceneSchema = z.discriminatedUnion('type', [
  z.object({ ...sceneBaseShape, type: z.literal('marquee'), config: marqueeConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('bounce'), config: bounceConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('pong'), config: pongConfigSchema }),
  z.object({ ...sceneBaseShape, type: z.literal('sync-test'), config: syncTestConfigSchema }),
])

export const deploymentAlbumSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  scenes: z.array(canvasSceneSchema).max(50),
  order: z.enum(['sequence', 'shuffle']),
  crossfadeMs: z.number().int().min(0).max(3000),
})

export const canvasDeploymentSchema = z.object({
  canvasId: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  revision: z.number().int().min(1),
  effectiveAt: z.number(),
  releaseAt: z.number().nullable(),
  slotId: z.string().min(1).max(40),
  config: canvasConfigSchema,
  album: deploymentAlbumSchema.nullable(),
})

export const canvasIdentifySchema = z.object({
  until: z.number(),
  canvasName: z.string().max(80),
  frameId: z.string().max(64),
  label: z.string().max(40).nullable(),
  marker: z.number().int().min(1).max(16),
  count: z.number().int().min(1).max(16),
})

export const canvasStateSchema = z.object({
  v: z.literal(1),
  active: canvasDeploymentSchema.nullable(),
  pending: canvasDeploymentSchema.nullable(),
  identify: canvasIdentifySchema.nullable(),
})

export const FRAME_CPX = { width: FRAME_WIDTH, height: FRAME_HEIGHT } as const
```

`FRAME_CPX` exists so the geometry module does not re-declare the constants. If you do not use it, remove the import and the export.

- [ ] **Step 4: Wire the new schemas into `lib/schema.ts`**

Add to the imports:
```ts
import { canvasConfigSchema, canvasSceneSchema } from './canvas/schema'
```

Add to `slideshowSchema`, after `reveal`:
```ts
  canvas: z.object({ crossfadeMs: z.number().int().min(0).max(3000) }).optional(),
```

Add to `albumUpdateSchema`, after `subject`:
```ts
  scenes: z.array(canvasSceneSchema).max(50).optional(),
```
and append a refine after the object closes:
```ts
}).superRefine((album, ctx) => {
  const isCanvas = album.theme === 'canvas'
  const presentationIsCanvas = album.slideshow.presentation === 'canvas'
  const hasScenes = album.scenes !== undefined
  if (isCanvas !== presentationIsCanvas) {
    ctx.addIssue({ code: 'custom', message: 'Canvas albums use the canvas presentation', path: ['slideshow', 'presentation'] })
  }
  if (isCanvas !== hasScenes) {
    ctx.addIssue({ code: 'custom', message: 'Canvas albums need scenes; other albums must not have them', path: ['scenes'] })
  }
  if (isCanvas) {
    if (album.items.length > 0) ctx.addIssue({ code: 'custom', message: 'Canvas albums have no artwork items', path: ['items'] })
    if (album.slideshow.transition !== 'none') ctx.addIssue({ code: 'custom', message: 'Canvas albums use transition none', path: ['slideshow', 'transition'] })
  }
})
```

Add to `layoutInputSchema`, after `settings`:
```ts
  kind: z.enum(['frame', 'canvas']).optional(),
  canvas: canvasConfigSchema.optional(),
```
and append a refine after the object closes:
```ts
}).superRefine((layout, ctx) => {
  const isCanvas = layout.kind === 'canvas'
  if (isCanvas && !layout.canvas) {
    ctx.addIssue({ code: 'custom', message: 'Canvas layouts need a canvas config', path: ['canvas'] })
  }
  if (!isCanvas && layout.canvas) {
    ctx.addIssue({ code: 'custom', message: 'Only canvas layouts carry a canvas config', path: ['canvas'] })
  }
  if (isCanvas && layout.widgets.length > 0) {
    ctx.addIssue({ code: 'custom', message: 'Canvas layouts have no widgets in phase 1', path: ['widgets'] })
  }
})
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/schema.test.ts`
Expected: PASS. The test uses inline scene fixtures and imports only modules that exist by this point.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/schema.ts lib/schema.ts lib/canvas/__tests__/schema.test.ts
git commit -m "feat(canvas): validate canvas layouts, albums and scenes"
```

---

### Task 4: Album metadata and defaults

`THEME_META` and `PRESENTATION_META` are `Record<...>` types, so the build stays red until every new union member has an entry. That is the point.

**Files:**
- Modify: `lib/albums.ts`
- Test: `lib/__tests__/albums.test.ts` (append)

- [ ] **Step 1: Add the failing test**

Change the existing import at the top of `lib/__tests__/albums.test.ts` from
`import { themeMeta, THEME_META } from '../albums'` to
`import { PRESENTATION_META, defaultSlideshow, themeMeta, THEME_META } from '../albums'`, then append:

```ts
describe('canvas album metadata', () => {
  it('has theme and presentation metadata', () => {
    expect(THEME_META.canvas.label).toBe('Canvas')
    expect(THEME_META.canvas.searchable).toBe(false)
    expect(PRESENTATION_META.canvas.label).toBe('Canvas')
  })

  it('defaults to the canvas presentation with no transition', () => {
    const slide = defaultSlideshow('canvas')
    expect(slide.presentation).toBe('canvas')
    expect(slide.transition).toBe('none')
    expect(slide.interval).toBe(30)
    expect(slide.canvas).toEqual({ crossfadeMs: 400 })
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/__tests__/albums.test.ts`
Expected: FAIL (property `canvas` does not exist).

- [ ] **Step 3: Add the entries**

In `lib/albums.ts`, import `PanelsLeftRight` from `lucide-react` and add to `THEME_META`:

```ts
  canvas: {
    label: 'Canvas',
    noun: 'scene',
    nowLabel: 'Canvas',
    icon: PanelsLeftRight,
    aspect: 9 / 16,
    searchable: false,
    source: 'Canvas scenes',
    placeholder: '',
    suggestions: [],
  },
```

Add to `PRESENTATION_META`:

```ts
  canvas: { label: 'Canvas', description: 'Scenes drawn across several frames as one surface' },
```

Add to `THEME_PRESENTATION`:

```ts
  canvas: 'canvas',
```

Update `defaultSlideshow` so the canvas presentation carries its crossfade:

```ts
export function defaultSlideshow(theme: AlbumTheme): Slideshow {
  const presentation = THEME_PRESENTATION[theme]
  return {
    presentation,
    transition: presentation === 'canvas' ? 'none' : presentation === 'fill' ? 'fade' : 'slide',
    kenBurns: presentation === 'fill',
    interval: presentation === 'canvas' ? 30 : presentation === 'fill' ? 20 : 30,
    order: 'sequence',
    artSize: presentation === 'vinyl' ? 68 : 74,
    artPosition: 'center',
    backdrop: 'blur',
    backdropColor: '#14161b',
    ...(presentation === 'canvas' ? { canvas: { crossfadeMs: 400 } } : {}),
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/__tests__/albums.test.ts && npx tsc --noEmit`
Expected: PASS, and the Record errors from Task 1 are gone.

- [ ] **Step 5: Commit**

```bash
git add lib/albums.ts lib/__tests__/albums.test.ts
git commit -m "feat(canvas): add canvas album metadata and defaults"
```

---

### Task 5: Normalize canvas albums

`normalize` runs on every read and every mutation. A legacy or API-created canvas album must always come out with `items: []`, `presentation: 'canvas'`, `transition: 'none'`, a scenes array and a clamped crossfade. Otherwise the frame renderer can receive a half-valid album.

**Files:**
- Modify: `lib/store.ts`
- Test: `lib/__tests__/store.test.ts` (append; create the file if absent)

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/store.test.ts`:

```ts
import { normalize, seed } from '@/lib/store'
import { defaultSlideshow } from '@/lib/albums'

describe('normalize canvas albums', () => {
  it('forces canvas invariants and clamps crossfade', () => {
    const store = seed()
    store.albums.push({
      id: 'canvas-1',
      name: 'Wall',
      theme: 'canvas',
      items: [{ id: 'x', image: '/x.png', sourceUrl: '', title: 'x', subtitle: '', year: '' }],
      slideshow: { ...defaultSlideshow('canvas'), transition: 'fade', canvas: { crossfadeMs: 99_000 } },
      scenes: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const out = normalize(store).albums.find((album) => album.id === 'canvas-1')!
    expect(out.items).toEqual([])
    expect(out.scenes).toEqual([])
    expect(out.slideshow.presentation).toBe('canvas')
    expect(out.slideshow.transition).toBe('none')
    expect(out.slideshow.canvas).toEqual({ crossfadeMs: 3000 })
  })

  it('leaves a canvas album with scenes intact', () => {
    const store = seed()
    const scene = { id: 's1', name: 'Test', enabled: true, durationSec: 30, seed: 1, type: 'sync-test' as const, config: { periodSec: 4, showGrid: true, showBezels: true } }
    store.albums.push({
      id: 'canvas-2',
      name: 'Wall',
      theme: 'canvas',
      items: [],
      scenes: [scene],
      slideshow: defaultSlideshow('canvas'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const out = normalize(store).albums.find((album) => album.id === 'canvas-2')!
    expect(out.scenes).toEqual([scene])
  })
})
```

Add `defaultSlideshow` to that file's imports if it is not already there.

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/__tests__/store.test.ts`
Expected: FAIL (items not cleared).

- [ ] **Step 3: Add the canvas branch**

In `lib/store.ts`, inside the `albums` map in `normalize`, insert this before `const isMosaic = ...`:

```ts
    if (next.theme === 'canvas') {
      const crossfadeMs = clampLegacyNumber(show.canvas?.crossfadeMs, 0, 3000, 400)
      return {
        ...next,
        items: [],
        scenes: next.scenes ?? [],
        slideshow: {
          ...show,
          presentation: 'canvas',
          transition: 'none',
          interval: clampLegacyNumber(show.interval, 3, 3600, 30),
          canvas: { crossfadeMs },
        } as Slideshow,
      }
    }
```

`clampLegacyNumber` is already declared above `normalize`, so no new helper is needed.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/__tests__/store.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts lib/__tests__/store.test.ts
git commit -m "feat(canvas): normalize canvas albums on read and write"
```

---

### Task 6: `canvas_state` table in both dialects

**Files:**
- Modify: `lib/db/schema.pg.ts`
- Modify: `lib/db/schema.sqlite.ts`
- Create: `drizzle/0005_*.sql` (generated)
- Modify: `drizzle/sqlite/0000_init.sql`
- Test: `lib/db/__tests__/schema.sqlite.test.ts`

- [ ] **Step 1: Extend the schema test**

Append to `lib/db/__tests__/schema.sqlite.test.ts`:

```ts
  it('exports canvasState with the report columns', () => {
    expect(s.canvasState).toBeDefined()
    const columns = Object.keys(s.canvasState)
    for (const name of ['instanceId', 'revision', 'data', 'updatedAt', 'reportedRevision', 'clockOffsetMs', 'clockUncertaintyMs', 'viewportW', 'viewportH', 'fpsAvg', 'reportedAt']) {
      expect(columns).toContain(name)
    }
  })
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/db/__tests__/schema.sqlite.test.ts`
Expected: FAIL (`canvasState` undefined).

- [ ] **Step 3: Add the Postgres table**

In `lib/db/schema.pg.ts`, `doublePrecision` is already imported; leave the import alone. Add before `databaseSchema`:

```ts
export const canvasState = pgTable('canvas_state', {
  instanceId: text('instance_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  reportedRevision: integer('reported_revision'),
  clockOffsetMs: doublePrecision('clock_offset_ms'),
  clockUncertaintyMs: doublePrecision('clock_uncertainty_ms'),
  viewportW: integer('viewport_w'),
  viewportH: integer('viewport_h'),
  fpsAvg: doublePrecision('fps_avg'),
  reportedAt: timestamp('reported_at', { withTimezone: true }),
})
```

Add `canvasState` to the `databaseSchema` object.

- [ ] **Step 4: Add the SQLite table**

In `lib/db/schema.sqlite.ts`, add:

```ts
export const canvasState = sqliteTable('canvas_state', {
  instanceId: text('instance_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
  data: text('data', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  reportedRevision: integer('reported_revision'),
  clockOffsetMs: real('clock_offset_ms'),
  clockUncertaintyMs: real('clock_uncertainty_ms'),
  viewportW: integer('viewport_w'),
  viewportH: integer('viewport_h'),
  fpsAvg: real('fps_avg'),
  reportedAt: integer('reported_at', { mode: 'timestamp_ms' }),
})
```

- [ ] **Step 5: Generate the Postgres migration**

Run:
```bash
pnpm exec drizzle-kit generate --name canvas_state
```
Expected: a new file `drizzle/0005_*.sql` and an updated `drizzle/meta/_journal.json`. Open the SQL and confirm it only creates `canvas_state` with the columns above. If drizzle-kit proposes changes to other tables, stop: the schema files have drifted and that is not this task.

- [ ] **Step 6: Append the SQLite DDL**

Append to `drizzle/sqlite/0000_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS canvas_state (
  instance_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  reported_revision INTEGER,
  clock_offset_ms REAL,
  clock_uncertainty_ms REAL,
  viewport_w INTEGER,
  viewport_h INTEGER,
  fps_avg REAL,
  reported_at INTEGER
);
```

The migration runner hashes each statement and applies it once, so this is safe on existing databases.

- [ ] **Step 7: Run the schema and migration tests**

Run: `pnpm vitest run lib/db/__tests__`
Expected: PASS, including the migration test that replays `0000_init.sql` against an in-memory database.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.pg.ts lib/db/schema.sqlite.ts lib/db/__tests__/schema.sqlite.test.ts drizzle/
git commit -m "feat(canvas): add canvas_state table in both dialects"
```

---

### Task 7: Canvas state store

**Files:**
- Create: `lib/canvas/state-store.ts`
- Test: `tests/canvas-state-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/canvas-state-store.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-state-store'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

const state = { v: 1 as const, active: null, pending: null, identify: null }

describe('canvas state store', () => {
  it('creates, bumps and reads a row', async () => {
    await freshDb()
    const { getCanvasState, putCanvasState } = await import('@/lib/canvas/state-store')
    expect(await getCanvasState('frame-a')).toBeNull()
    const first = await putCanvasState('frame-a', state)
    expect(first).toBe(1)
    const second = await putCanvasState('frame-a', { ...state, identify: { until: 1, canvasName: 'c', frameId: 'f', label: null, marker: 1, count: 1 } })
    expect(second).toBe(2)
    const row = await getCanvasState('frame-a')
    expect(row?.revision).toBe(2)
    expect(row?.data.identify?.marker).toBe(1)
  })

  it('applies a remote revision exactly and clears on revision 0', async () => {
    await freshDb()
    const { applyRemoteCanvasState, getCanvasState } = await import('@/lib/canvas/state-store')
    await applyRemoteCanvasState('frame-a', 7, state)
    expect((await getCanvasState('frame-a'))?.revision).toBe(7)
    await applyRemoteCanvasState('frame-a', 0, null)
    expect(await getCanvasState('frame-a')).toBeNull()
  })

  it('records a report once and throttles repeats', async () => {
    await freshDb()
    const { getCanvasState, putCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-a', state)
    const now = 1_000_000
    await recordCanvasReport('frame-a', { appliedRevision: 1, clockOffsetMs: 12, clockUncertaintyMs: 6, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 }, now)
    let row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(1)
    expect(row?.clockOffsetMs).toBe(12)
    expect(row?.reportedAt?.getTime()).toBe(now)
    await recordCanvasReport('frame-a', { appliedRevision: 9, clockOffsetMs: 99, clockUncertaintyMs: 1, viewportW: 1, viewportH: 1, fpsAvg: 1 }, now + 5_000)
    row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(1)
    await recordCanvasReport('frame-a', { appliedRevision: 9, clockOffsetMs: 99, clockUncertaintyMs: 1, viewportW: 1, viewportH: 1, fpsAvg: 1 }, now + 11_000)
    row = await getCanvasState('frame-a')
    expect(row?.reportedRevision).toBe(9)
  })

  it('does not create a row for a report on an unknown instance', async () => {
    await freshDb()
    const { getCanvasState, recordCanvasReport } = await import('@/lib/canvas/state-store')
    await recordCanvasReport('ghost', { appliedRevision: 1, clockOffsetMs: null, clockUncertaintyMs: null, viewportW: null, viewportH: null, fpsAvg: null }, 1_000_000)
    expect(await getCanvasState('ghost')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-state-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/state-store.ts`**

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { getTables } from '@/lib/db/tables'
import type { CanvasState } from '@/lib/types'

export type CanvasStateRow = {
  instanceId: string
  revision: number
  data: CanvasState
  updatedAt: Date
  reportedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
  reportedAt: Date | null
}

export type MemberReport = {
  appliedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

const EMPTY_STATE: CanvasState = { v: 1, active: null, pending: null, identify: null }
const REPORT_THROTTLE_MS = 10_000

function table() {
  return getTables().canvasState
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string') return new Date(value)
  return null
}

function toRow(row: Record<string, unknown>): CanvasStateRow {
  return {
    instanceId: row.instanceId as string,
    revision: Number(row.revision ?? 0),
    data: row.data as CanvasState,
    updatedAt: toDate(row.updatedAt) ?? new Date(0),
    reportedRevision: (row.reportedRevision as number | null) ?? null,
    clockOffsetMs: (row.clockOffsetMs as number | null) ?? null,
    clockUncertaintyMs: (row.clockUncertaintyMs as number | null) ?? null,
    viewportW: (row.viewportW as number | null) ?? null,
    viewportH: (row.viewportH as number | null) ?? null,
    fpsAvg: (row.fpsAvg as number | null) ?? null,
    reportedAt: toDate(row.reportedAt),
  }
}

export async function getCanvasState(instanceId: string): Promise<CanvasStateRow | null> {
  const db = getDb()
  const rows = await db.select().from(table()).where(eq(table().instanceId, instanceId)).limit(1)
  return rows[0] ? toRow(rows[0] as Record<string, unknown>) : null
}

export async function listCanvasStates(): Promise<CanvasStateRow[]> {
  const db = getDb()
  const rows = await db.select().from(table())
  return rows.map((row) => toRow(row as Record<string, unknown>))
}

export async function putCanvasState(instanceId: string, data: CanvasState): Promise<number> {
  const db = getDb()
  const existing = await getCanvasState(instanceId)
  const revision = (existing?.revision ?? 0) + 1
  const now = new Date()
  await db
    .insert(table())
    .values({ instanceId, revision, data, updatedAt: now })
    .onConflictDoUpdate({ target: table().instanceId, set: { revision, data, updatedAt: now } })
  return revision
}

/** Apply a console revision verbatim. revision 0 + null state clears the row. */
export async function applyRemoteCanvasState(instanceId: string, revision: number, data: CanvasState | null): Promise<number> {
  if (revision <= 0 || data === null) {
    await deleteCanvasState(instanceId)
    return 0
  }
  const db = getDb()
  const now = new Date()
  await db
    .insert(table())
    .values({ instanceId, revision, data, updatedAt: now })
    .onConflictDoUpdate({ target: table().instanceId, set: { revision, data, updatedAt: now } })
  return revision
}

export async function deleteCanvasState(instanceId: string): Promise<void> {
  const db = getDb()
  await db.delete(table()).where(eq(table().instanceId, instanceId))
}

function clampNumber(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

/**
 * Record what a display reported. Console-only in practice; the caller guards
 * the database mode. Throttled per instance so a 5 s poll cannot become a write
 * every 5 s. A missing row is left missing: a report alone must not create
 * canvas state for an instance that has never been deployed.
 */
export async function recordCanvasReport(instanceId: string, report: MemberReport, nowMs = Date.now()): Promise<void> {
  const existing = await getCanvasState(instanceId)
  if (!existing) return
  if (existing.reportedAt && nowMs - existing.reportedAt.getTime() < REPORT_THROTTLE_MS) return

  const db = getDb()
  const applied = report.appliedRevision === null ? null : Math.max(0, Math.floor(report.appliedRevision))
  await db
    .update(table())
    .set({
      reportedRevision: applied,
      clockOffsetMs: clampNumber(report.clockOffsetMs, -60_000, 60_000),
      clockUncertaintyMs: clampNumber(report.clockUncertaintyMs, 0, 60_000),
      viewportW: report.viewportW === null ? null : Math.round(clampNumber(report.viewportW, 1, 100_000) ?? 1),
      viewportH: report.viewportH === null ? null : Math.round(clampNumber(report.viewportH, 1, 100_000) ?? 1),
      fpsAvg: clampNumber(report.fpsAvg, 0, 240),
      reportedAt: new Date(nowMs),
    })
    .where(eq(table().instanceId, instanceId))
}

/**
 * Drop rows whose deployment has fully expired and has nothing pending.
 * Deterministic and allocation-light: rows are read once, filtered in JS, then
 * deleted one by one (no SQL max/min, which the dialect note warns about).
 */
export async function pruneCanvasState(nowMs = Date.now()): Promise<number> {
  const rows = await listCanvasStates()
  const expired = rows.filter((row) => {
    const { active, pending } = row.data ?? EMPTY_STATE
    if (pending) return false
    if (row.data?.identify && row.data.identify.until > nowMs) return false
    if (!active) return true
    if (active.releaseAt === null) return false
    return active.releaseAt <= nowMs
  })
  for (const row of expired) await deleteCanvasState(row.instanceId)
  return expired.length
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run tests/canvas-state-store.test.ts`
Expected: PASS. If the Date assertions fail, check that `timestamp_ms` columns are returned as `Date` by drizzle; they are in this repo, and `toRow` also accepts a number and wraps it with `new Date(number)` only if needed. Do not change the schema mode.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/state-store.ts tests/canvas-state-store.test.ts
git commit -m "feat(canvas): add canvas state store"
```

---

### Task 8: Seeded randomness and math helpers

**Files:**
- Create: `lib/canvas/math.ts`
- Create: `lib/canvas/prng.ts`
- Test: `lib/canvas/__tests__/prng.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/prng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clamp, fold } from '@/lib/canvas/math'
import { hash01, hash32, sampleInt, seedFromString, seededPermutation } from '@/lib/canvas/prng'

describe('fold', () => {
  it('is a triangle wave with period 2 * range', () => {
    expect(fold(0, 10)).toBe(0)
    expect(fold(5, 10)).toBe(5)
    expect(fold(10, 10)).toBe(10)
    expect(fold(15, 10)).toBe(5)
    expect(fold(20, 10)).toBe(0)
    expect(fold(-5, 10)).toBe(5)
    expect(fold(-20, 10)).toBe(0)
  })

  it('returns 0 for a non-positive range', () => {
    expect(fold(3, 0)).toBe(0)
    expect(fold(3, -1)).toBe(0)
  })
})

describe('seeded permutation', () => {
  it('is a stable permutation for the same seed and round', () => {
    const a = seededPermutation(8, 1234, 3)
    const b = seededPermutation(8, 1234, 3)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('varies across rounds and seeds', () => {
    const a = seededPermutation(12, 1234, 0)
    const b = seededPermutation(12, 1234, 1)
    const c = seededPermutation(12, 999, 0)
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('hash helpers', () => {
  it('is deterministic and in range', () => {
    expect(hash01(42, 7)).toBe(hash01(42, 7))
    for (let k = 0; k < 100; k++) {
      const value = hash01(42, k)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(sampleInt(42, k, 3, 7)).toBeGreaterThanOrEqual(3)
      expect(sampleInt(42, k, 3, 7)).toBeLessThanOrEqual(7)
    }
    expect(seedFromString('abc')).toBe(seedFromString('abc'))
    expect(hash32(1)).toBe(hash32(1))
  })

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/prng.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `lib/canvas/math.ts`**

```ts
/** Triangle wave: maps u onto [0, range], reflecting at both ends. */
export function fold(u: number, range: number): number {
  if (!(range > 0)) return 0
  const period = 2 * range
  const m = ((u % period) + period) % period
  return m <= range ? m : period - m
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
```

- [ ] **Step 4: Implement `lib/canvas/prng.ts`**

```ts
import { hash01 } from '@/lib/mosaic'

export { hash01, seedFromString } from '@/lib/mosaic'

export function hash32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

/** Stable Fisher-Yates permutation for an (n, seed, round) triple. */
export function seededPermutation(n: number, seed: number, round: number): number[] {
  const order = Array.from({ length: Math.max(0, n) }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const value = hash01(seed, round * 997 + i * 31 + 7)
    const j = Math.floor(value * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order
}

export function sampleInt(seed: number, k: number, min: number, max: number): number {
  if (max < min) return min
  const value = Math.floor(hash01(seed, k) * (max - min + 1))
  return Math.min(max, min + value)
}

export function pickIndex(seed: number, k: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.floor(hash01(seed, k) * length))
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/prng.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/math.ts lib/canvas/prng.ts lib/canvas/__tests__/prng.test.ts
git commit -m "feat(canvas): add seeded math helpers"
```

---

### Task 9: Geometry

**Files:**
- Create: `lib/canvas/geometry.ts`
- Test: `lib/canvas/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig } from '@/lib/types'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

function config(overrides: Partial<CanvasConfig> = {}): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 0,
    align: 'center',
    slots: [
      { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
      { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
    ],
    background: '#000000',
    markers: 'identify',
    notifications: 'suppress',
    nightMode: 'inherit',
    maxFps: 30,
    ...overrides,
  }
}

describe('resolveGeometry', () => {
  it('lays out a row with a gap and center alignment', () => {
    const g = resolveGeometry(config({ gap: 120 }))
    expect(g.width).toBe(FRAME_WIDTH * 2 + 120)
    expect(g.height).toBe(FRAME_HEIGHT)
    expect(g.slots.map((slot) => slot.x)).toEqual([0, FRAME_WIDTH + 120])
    expect(g.slots.map((slot) => slot.marker)).toEqual([1, 2])
    expect(g.gaps).toEqual([{ x: FRAME_WIDTH, y: 0, w: 120, h: FRAME_HEIGHT }])
    expect(validateGeometry(g)).toEqual([])
  })

  it('lays out a column with end alignment', () => {
    const g = resolveGeometry(config({ arrangement: 'column', align: 'end', gap: 60 }))
    expect(g.height).toBe(FRAME_HEIGHT * 2 + 60)
    expect(g.width).toBe(FRAME_WIDTH)
    expect(g.slots[0].y).toBe(0)
    expect(g.slots[1].y).toBe(FRAME_HEIGHT + 60)
  })

  it('lays out a grid row-major with grid columns', () => {
    const slots = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, frameId: null, offset: { x: 0, y: 0 }, scale: 1 }))
    const g = resolveGeometry(config({ arrangement: 'grid', gridColumns: 2, gap: 10, slots }))
    expect(g.width).toBe(FRAME_WIDTH * 2 + 10)
    expect(g.height).toBe(FRAME_HEIGHT * 2 + 10)
    expect(g.slots[2].x).toBe(0)
    expect(g.slots[2].y).toBe(FRAME_HEIGHT + 10)
  })

  it('applies per-slot offsets and re-bases the bounding box', () => {
    const g = resolveGeometry(config({
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 100, y: 50 }, scale: 1 },
        { id: 'b', frameId: 'fb', offset: { x: 100, y: 50 }, scale: 1 },
      ],
    }))
    expect(g.slots[0].x).toBe(0)
    expect(g.slots[0].y).toBe(0)
    expect(g.width).toBe(FRAME_WIDTH * 2)
  })

  it('supports different scales while keeping the slot size', () => {
    const g = resolveGeometry(config({
      align: 'start',
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 0.5 },
        { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
      ],
    }))
    expect(g.slots[0].w).toBe(FRAME_WIDTH / 2)
    expect(g.slots[0].h).toBe(FRAME_HEIGHT / 2)
    expect(g.slots[1].w).toBe(FRAME_WIDTH)
  })

  it('is deterministic', () => {
    const a = resolveGeometry(config({ gap: 17 }))
    const b = resolveGeometry(config({ gap: 17 }))
    expect(a).toEqual(b)
  })

  it('renumbers markers contiguously after removal', () => {
    const three = resolveGeometry(config({
      slots: ['a', 'b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
    }))
    const two = resolveGeometry(config({
      slots: ['b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
    }))
    expect(three.slots[2].marker).toBe(3)
    expect(two.slots.map((slot) => slot.marker)).toEqual([1, 2])
    expect(two.slots[0].slotId).toBe('b')
  })
})

describe('validateGeometry', () => {
  it('reports overlap, too large and no slots', () => {
    const overlap = resolveGeometry(config({
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 'b', frameId: 'fb', offset: { x: -100, y: 0 }, scale: 1 },
      ],
    }))
    expect(validateGeometry(overlap).map((issue) => issue.code)).toContain('E_OVERLAP')

    const huge = resolveGeometry(config({
      slots: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, frameId: `f${i}`, offset: { x: 0, y: 0 }, scale: 2 })),
    }))
    expect(validateGeometry(huge).map((issue) => issue.code)).toContain('E_TOO_LARGE')

    expect(validateGeometry({ width: 0, height: 0, slots: [], gaps: [] }).map((issue) => issue.code)).toEqual(['E_NO_SLOTS'])
  })

  it('accepts touching edges', () => {
    const g = resolveGeometry(config({ gap: 0, align: 'start' }))
    expect(validateGeometry(g)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/geometry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/geometry.ts`**

```ts
import type { CanvasConfig } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

export type ResolvedSlot = {
  slotId: string
  index: number
  marker: number
  x: number
  y: number
  w: number
  h: number
  scale: number
}

export type GapRect = { x: number; y: number; w: number; h: number }

export type ResolvedGeometry = {
  width: number
  height: number
  slots: ResolvedSlot[]
  gaps: GapRect[]
}

export type GeometryIssue = {
  code: 'E_OVERLAP' | 'E_TOO_LARGE' | 'E_NO_SLOTS'
  message: string
  slotIds?: string[]
}

const MAX_CANVAS_CPX = 32000

function crossOffset(align: 'start' | 'center' | 'end', outer: number, inner: number): number {
  if (align === 'start') return 0
  if (align === 'end') return outer - inner
  return (outer - inner) / 2
}

/**
 * Place slots on the canvas. Pure and deterministic: the same config always
 * produces the same geometry. Coordinates are canvas px with the minimum
 * corner re-based to (0, 0).
 */
export function resolveGeometry(config: CanvasConfig): ResolvedGeometry {
  if (config.slots.length === 0) return { width: 0, height: 0, slots: [], gaps: [] }

  const sizes = config.slots.map((slot) => ({ w: FRAME_WIDTH * slot.scale, h: FRAME_HEIGHT * slot.scale }))
  const raw: { x: number; y: number; w: number; h: number }[] = []

  if (config.arrangement === 'row') {
    const height = Math.max(...sizes.map((size) => size.h))
    let x = 0
    sizes.forEach((size) => {
      raw.push({ x, y: crossOffset(config.align, height, size.h), w: size.w, h: size.h })
      x += size.w + config.gap
    })
  } else if (config.arrangement === 'column') {
    const width = Math.max(...sizes.map((size) => size.w))
    let y = 0
    sizes.forEach((size) => {
      raw.push({ x: crossOffset(config.align, width, size.w), y, w: size.w, h: size.h })
      y += size.h + config.gap
    })
  } else {
    const columns = Math.min(8, Math.max(1, config.gridColumns ?? Math.ceil(Math.sqrt(config.slots.length))))
    const cellW = Math.max(...sizes.map((size) => size.w))
    const cellH = Math.max(...sizes.map((size) => size.h))
    sizes.forEach((size, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellX = column * (cellW + config.gap)
      const cellY = row * (cellH + config.gap)
      raw.push({
        x: cellX + crossOffset(config.align, cellW, size.w),
        y: cellY + crossOffset(config.align, cellH, size.h),
        w: size.w,
        h: size.h,
      })
    })
  }

  raw.forEach((rect, index) => {
    rect.x += config.slots[index].offset.x
    rect.y += config.slots[index].offset.y
  })

  const minX = Math.min(...raw.map((rect) => rect.x))
  const minY = Math.min(...raw.map((rect) => rect.y))

  const slots: ResolvedSlot[] = raw.map((rect, index) => ({
    slotId: config.slots[index].id,
    index,
    marker: index + 1,
    x: rect.x - minX,
    y: rect.y - minY,
    w: rect.w,
    h: rect.h,
    scale: config.slots[index].scale,
  }))

  const width = Math.max(...slots.map((slot) => slot.x + slot.w))
  const height = Math.max(...slots.map((slot) => slot.y + slot.h))

  return { width, height, slots, gaps: computeGaps(slots) }
}

/**
 * Gap rectangles are the visible bezel bands between non-overlapping slots.
 * Two slots qualify when they have positive overlap on one axis and positive
 * separation on the other. O(n^2) with n <= 16 is deliberate and cheap.
 */
function computeGaps(slots: ResolvedSlot[]): GapRect[] {
  const gaps: GapRect[] = []
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)

      if (xOverlap > 0 && yOverlap <= 0) {
        const yStart = Math.min(a.y + a.h, b.y + b.h)
        const yEnd = Math.max(a.y, b.y)
        if (yEnd > yStart) {
          gaps.push({ x: Math.max(a.x, b.x), y: yStart, w: xOverlap, h: yEnd - yStart })
        }
      }

      if (yOverlap > 0 && xOverlap <= 0) {
        const xStart = Math.min(a.x + a.w, b.x + b.w)
        const xEnd = Math.max(a.x, b.x)
        if (xEnd > xStart) {
          gaps.push({ x: xStart, y: Math.max(a.y, b.y), w: xEnd - xStart, h: yOverlap })
        }
      }
    }
  }
  return gaps
}

export function validateGeometry(geometry: ResolvedGeometry): GeometryIssue[] {
  const issues: GeometryIssue[] = []
  if (geometry.slots.length === 0) {
    issues.push({ code: 'E_NO_SLOTS', message: 'A canvas needs at least one slot' })
    return issues
  }

  if (geometry.width > MAX_CANVAS_CPX || geometry.height > MAX_CANVAS_CPX) {
    issues.push({ code: 'E_TOO_LARGE', message: `Canvas is larger than ${MAX_CANVAS_CPX} cpx` })
  }

  for (let i = 0; i < geometry.slots.length; i++) {
    for (let j = i + 1; j < geometry.slots.length; j++) {
      const a = geometry.slots[i]
      const b = geometry.slots[j]
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (overlapW > 0 && overlapH > 0) {
        issues.push({ code: 'E_OVERLAP', message: `Slots ${a.slotId} and ${b.slotId} overlap`, slotIds: [a.slotId, b.slotId] })
      }
    }
  }

  return issues
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/geometry.test.ts`
Expected: PASS. The "too large" fixture is 16 slots at scale 2 in a row: `16 * 2160 = 34560`, over 32000.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/geometry.ts lib/canvas/__tests__/geometry.test.ts
git commit -m "feat(canvas): resolve canvas slot geometry"
```

---

### Task 10: Scheduler

**Files:**
- Create: `lib/canvas/scheduler.ts`
- Test: `lib/canvas/__tests__/scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/scheduler.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasScene, DeploymentAlbum } from '@/lib/types'
import { sceneAt } from '@/lib/canvas/scheduler'

function scene(id: string, seconds: number, enabled = true): CanvasScene {
  return { id, name: id, enabled, durationSec: seconds, seed: 7, type: 'sync-test', config: { periodSec: 4, showGrid: true, showBezels: true } }
}

function album(scenes: CanvasScene[], order: 'sequence' | 'shuffle' = 'sequence'): DeploymentAlbum {
  return { id: 'alb', name: 'Album', scenes, order, crossfadeMs: 1000 }
}

const three = album([scene('a', 10), scene('b', 10), scene('c', 10)])

describe('sceneAt', () => {
  it('walks scenes in sequence order', () => {
    expect(sceneAt(three, 1, 0, 1000)?.scene.id).toBe('a')
    expect(sceneAt(three, 1, 9_999, 1000)?.scene.id).toBe('a')
    expect(sceneAt(three, 1, 10_000, 1000)?.scene.id).toBe('b')
    expect(sceneAt(three, 1, 20_000, 1000)?.scene.id).toBe('c')
    expect(sceneAt(three, 1, 30_000, 1000)?.scene.id).toBe('a')
  })

  it('reports scene-local time, cycle and the next change', () => {
    const plan = sceneAt(three, 1, 15_000, 1000)!
    expect(plan.sceneTimeMs).toBe(5_000)
    expect(plan.cycle).toBe(0)
    expect(plan.nextChangeAtMs).toBe(20_000)
    expect(plan.index).toBe(1)
  })

  it('returns null before the origin, for empty albums and for all-disabled albums', () => {
    expect(sceneAt(three, 1, -1, 1000)).toBeNull()
    expect(sceneAt(album([]), 1, 0, 1000)).toBeNull()
    expect(sceneAt(album([scene('a', 10, false)]), 1, 0, 1000)).toBeNull()
  })

  it('ramps opacity at both scene edges', () => {
    expect(sceneAt(three, 1, 0, 1000)?.fade).toBe(0)
    expect(sceneAt(three, 1, 500, 1000)?.fade).toBeCloseTo(0.5, 5)
    expect(sceneAt(three, 1, 5_000, 1000)?.fade).toBe(1)
    expect(sceneAt(three, 1, 9_500, 1000)?.fade).toBeCloseTo(0.5, 5)
    expect(sceneAt(three, 1, 9_999, 1000)?.fade).toBeCloseTo(0.001, 2)
  })

  it('caps the fade window at a third of very short scenes', () => {
    const short = album([scene('a', 5), scene('b', 5)])
    expect(sceneAt(short, 1, 1_000, 3_000)?.fade).toBeCloseTo(0.6, 5)
  })

  it('shuffle uses each scene exactly once per cycle and keeps the cycle length', () => {
    const shuffled = album([scene('a', 10), scene('b', 20), scene('c', 30)], 'shuffle')
    const first = sceneAt(shuffled, 42, 0, 0)!
    const atEnd = sceneAt(shuffled, 42, 60_000, 0)!
    expect(atEnd.cycle).toBe(1)
    expect(atEnd.sceneTimeMs).toBe(0)
    expect(sceneAt(shuffled, 42, 30_000, 0)?.cycle).toBe(0)
    const seen = new Set<string>()
    for (let t = 0; t < 60_000; t += 100) seen.add(sceneAt(shuffled, 42, t, 0)!.scene.id)
    expect([...seen].sort()).toEqual(['a', 'b', 'c'])
    expect(first.cycle).toBe(0)
  })

  it('stays finite for a week of playback', () => {
    const plan = sceneAt(three, 1, 7 * 24 * 60 * 60 * 1000, 1000)!
    expect(Number.isFinite(plan.sceneTimeMs)).toBe(true)
    expect(Number.isFinite(plan.nextChangeAtMs)).toBe(true)
    expect(Number.isFinite(plan.fade)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/scheduler.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/scheduler.ts`**

```ts
import type { CanvasScene, DeploymentAlbum } from '@/lib/types'
import { hash32, seededPermutation } from './prng'

export type ScenePlan = {
  scene: CanvasScene
  index: number
  sceneTimeMs: number
  cycle: number
  nextChangeAtMs: number
  fade: number
  seed: number
}

/**
 * Find the scene at an absolute synced time. Pure: the same inputs always give
 * the same plan, on every frame. `tSinceEpochMs` is measured from the
 * deployment's `effectiveAt`.
 */
export function sceneAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tSinceEpochMs: number,
  crossfadeMs: number,
): ScenePlan | null {
  const enabled = album.scenes.filter((scene) => scene.enabled && scene.durationSec > 0)
  if (enabled.length === 0) return null
  if (!Number.isFinite(tSinceEpochMs) || tSinceEpochMs < 0) return null

  const total = enabled.reduce((sum, scene) => sum + scene.durationSec * 1000, 0)
  if (!(total > 0)) return null

  const cycle = Math.floor(tSinceEpochMs / total)
  let elapsed = tSinceEpochMs - cycle * total

  const order =
    album.order === 'shuffle'
      ? seededPermutation(enabled.length, hash32(albumSeed ^ hash32(cycle)), 0)
      : enabled.map((_, index) => index)

  let chosen = order[order.length - 1]
  for (const position of order) {
    const duration = enabled[position].durationSec * 1000
    if (elapsed < duration) {
      chosen = position
      break
    }
    elapsed -= duration
  }

  const scene = enabled[chosen]
  const duration = scene.durationSec * 1000
  const sceneTimeMs = Math.min(duration, Math.max(0, elapsed))
  const fadeWindow = Math.min(Math.max(0, crossfadeMs), duration / 3)
  const fade =
    fadeWindow > 0
      ? Math.max(0, Math.min(1, Math.min(sceneTimeMs / fadeWindow, (duration - sceneTimeMs) / fadeWindow)))
      : 1

  return {
    scene,
    index: chosen,
    sceneTimeMs,
    cycle,
    nextChangeAtMs: tSinceEpochMs + (duration - sceneTimeMs),
    fade,
    seed: album.order === 'shuffle' ? hash32(scene.seed ^ hash32(cycle)) : scene.seed,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scheduler.ts lib/canvas/__tests__/scheduler.test.ts
git commit -m "feat(canvas): schedule scenes from synced time"
```

---

### Task 11: Clock estimation

**Files:**
- Create: `lib/canvas/clock.ts`
- Test: `lib/canvas/__tests__/clock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { estimate, sampleFrom, slewOffset, type ClockSample } from '@/lib/canvas/clock'

function sample(offsetMs: number, rttMs: number, at: number): ClockSample {
  return { at, rttMs, offsetMs }
}

describe('sampleFrom', () => {
  it('computes the offset with half the round trip', () => {
    expect(sampleFrom(1000, 1100, 2050)).toEqual({ at: 1100, rttMs: 100, offsetMs: 1000 })
  })

  it('drops negative and absurd round trips', () => {
    expect(sampleFrom(1100, 1000, 0)).toBeNull()
    expect(sampleFrom(0, 3001, 0)).toBeNull()
  })
})

describe('estimate', () => {
  it('returns null with no fresh samples', () => {
    expect(estimate([], 10_000)).toBeNull()
    expect(estimate([sample(0, 10, 0)], 200_000)).toBeNull()
  })

  it('chooses the minimum-RTT sample among the latest eight', () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample(100 + i, 40 + i, 1_000 + i))
    const result = estimate(samples, 2_000)!
    expect(result.offsetMs).toBe(102)
    expect(result.uncertaintyMs).toBe(21)
    expect(result.quality).toBe('fair')
  })

  it('grades quality from uncertainty and jitter', () => {
    const good = estimate([sample(10, 20, 1_000), sample(10, 20, 1_100), sample(11, 20, 1_200), sample(10, 20, 1_300)], 2_000)!
    expect(good.quality).toBe('good')
    expect(good.jitterMs).toBeLessThan(10)

    const fair = estimate([sample(10, 80, 1_000)], 2_000)!
    expect(fair.quality).toBe('fair')
    expect(fair.uncertaintyMs).toBe(40)
  })

  it('drops samples older than 120 seconds', () => {
    const result = estimate([sample(1, 10, 0), sample(2, 10, 100_000)], 130_000)!
    expect(result.offsetMs).toBe(2)
  })
})

describe('slewOffset', () => {
  it('steps for large corrections', () => {
    expect(slewOffset(0, 300, 1_000)).toBe(300)
  })

  it('moves at the rate limit and never overshoots', () => {
    expect(slewOffset(0, 10, 1_000)).toBe(2)
    expect(slewOffset(0, 10, 6_000)).toBe(10)
    expect(slewOffset(0, -1, 250)).toBe(-0.5)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/clock.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/clock.ts`**

```ts
export type ClockSample = { at: number; rttMs: number; offsetMs: number }

export type ClockQuality = 'good' | 'fair' | 'poor'

export type ClockEstimate = {
  offsetMs: number
  uncertaintyMs: number
  jitterMs: number
  quality: ClockQuality
  sampledAt: number
}

const MAX_RTT_MS = 3000
const FRESH_MS = 120_000
const MAX_SAMPLES = 16
const RECENT = 8

/** `offsetMs` is console time minus local time. */
export function sampleFrom(t0: number, t1: number, serverTime: number): ClockSample | null {
  const rtt = t1 - t0
  if (!(rtt >= 0 && rtt <= MAX_RTT_MS)) return null
  return { at: t1, rttMs: rtt, offsetMs: serverTime + rtt / 2 - t1 }
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function estimate(samples: ClockSample[], now: number): ClockEstimate | null {
  const fresh = samples
    .filter((sample) => Number.isFinite(sample.at) && Number.isFinite(sample.rttMs) && Number.isFinite(sample.offsetMs))
    .filter((sample) => now - sample.at <= FRESH_MS)
    .slice(-MAX_SAMPLES)
  if (fresh.length === 0) return null

  const recent = fresh.slice(-RECENT)
  const best = recent.reduce((winner, sample) => (sample.rttMs < winner.rttMs ? sample : winner), recent[0])
  const lowRtt = [...recent].sort((a, b) => a.rttMs - b.rttMs).slice(0, 4)
  const jitterMs = standardDeviation(lowRtt.map((sample) => sample.offsetMs))
  const uncertaintyMs = best.rttMs / 2
  const quality: ClockQuality =
    uncertaintyMs <= 15 && jitterMs <= 10 ? 'good' : uncertaintyMs <= 50 ? 'fair' : 'poor'

  return { offsetMs: best.offsetMs, uncertaintyMs, jitterMs, quality, sampledAt: best.at }
}

/**
 * Move the applied offset toward the target without a visible jump. A step
 * above the threshold is a genuine clock change; below it the correction is
 * spread over time at `maxRateMsPerSec`.
 */
export function slewOffset(applied: number, target: number, dtMs: number, maxRateMsPerSec = 2, stepThresholdMs = 250): number {
  const delta = target - applied
  if (Math.abs(delta) > stepThresholdMs) return target
  const maxStep = (maxRateMsPerSec * Math.max(0, dtMs)) / 1000
  if (Math.abs(delta) <= maxStep) return target
  return applied + Math.sign(delta) * maxStep
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/clock.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/clock.ts lib/canvas/__tests__/clock.test.ts
git commit -m "feat(canvas): estimate and slew console clock offset"
```

---

### Task 12: Takeover resolution

**Files:**
- Create: `lib/canvas/takeover.ts`
- Test: `lib/canvas/__tests__/takeover.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/takeover.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasDeployment, CanvasState } from '@/lib/types'
import { resolveCanvasTakeover } from '@/lib/canvas/takeover'

const config = {
  arrangement: 'row' as const,
  gap: 0,
  align: 'center' as const,
  slots: [
    { id: 'a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'frame-b', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify' as const,
  notifications: 'suppress' as const,
  nightMode: 'inherit' as const,
  maxFps: 30 as const,
}

function deployment(overrides: Partial<CanvasDeployment> = {}): CanvasDeployment {
  return {
    canvasId: 'wall',
    name: 'Wall',
    revision: 1,
    effectiveAt: 1_000,
    releaseAt: null,
    slotId: 'b',
    config,
    album: null,
    ...overrides,
  }
}

function state(overrides: Partial<CanvasState> = {}): CanvasState {
  return { v: 1, active: deployment(), pending: null, identify: null, ...overrides }
}

describe('resolveCanvasTakeover', () => {
  it('returns the active deployment with geometry and the matching slot', () => {
    const result = resolveCanvasTakeover(state(), 2_000)!
    expect(result.deployment.canvasId).toBe('wall')
    expect(result.geometry.width).toBe(2160)
    expect(result.slot.slotId).toBe('b')
    expect(result.slot.marker).toBe(2)
  })

  it('promotes pending at effectiveAt and keeps active before it', () => {
    const pending = deployment({ revision: 2, effectiveAt: 5_000 })
    const both = state({ pending })
    expect(resolveCanvasTakeover(both, 4_999)?.deployment.revision).toBe(1)
    expect(resolveCanvasTakeover(both, 5_000)?.deployment.revision).toBe(2)
  })

  it('does not take over before effectiveAt or after releaseAt', () => {
    expect(resolveCanvasTakeover(state(), 999)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: deployment({ releaseAt: 2_000 }) }), 2_000)).toBeNull()
  })

  it('returns null without state or when the slot is missing', () => {
    expect(resolveCanvasTakeover(null, 2_000)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: null }), 2_000)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: deployment({ slotId: 'gone' }) }), 2_000)).toBeNull()
  })

  it('never consults identify', () => {
    const identify = { until: 9_999, canvasName: 'Wall', frameId: 'frame-b', label: null, marker: 2, count: 2 }
    expect(resolveCanvasTakeover(state({ identify }), 2_000)?.slot.slotId).toBe('b')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/takeover.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/takeover.ts`**

```ts
import type { CanvasState, CanvasDeployment } from '@/lib/types'
import { resolveGeometry, type ResolvedGeometry, type ResolvedSlot } from './geometry'

export type CanvasTakeover = {
  deployment: CanvasDeployment
  geometry: ResolvedGeometry
  slot: ResolvedSlot
}

/**
 * A canvas takeover overrides the frame's own layout and schedule while it is
 * live. It never mutates the frame document, so releasing needs no restore.
 */
export function resolveCanvasTakeover(state: CanvasState | null, nowMs: number): CanvasTakeover | null {
  if (!state) return null

  const candidate =
    state.pending && nowMs >= state.pending.effectiveAt ? state.pending : state.active
  if (!candidate) return null
  if (nowMs < candidate.effectiveAt) return null
  if (candidate.releaseAt !== null && nowMs >= candidate.releaseAt) return null

  const geometry = resolveGeometry(candidate.config)
  const slot = geometry.slots.find((entry) => entry.slotId === candidate.slotId)
  if (!slot) return null

  return { deployment: candidate, geometry, slot }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/takeover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/takeover.ts lib/canvas/__tests__/takeover.test.ts
git commit -m "feat(canvas): resolve canvas takeover"
```

---

### Task 13: Scene contracts and the sync test

**Files:**
- Create: `lib/canvas/scenes/types.ts`
- Create: `lib/canvas/scenes/sync-test.ts`
- Test: `lib/canvas/__tests__/sync-test.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/sync-test.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveGeometry } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'
import { syncTestState } from '@/lib/canvas/scenes/sync-test'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const geometry = resolveGeometry(config)
const bounds = { width: geometry.width, height: geometry.height }

describe('syncTestState', () => {
  it('sweeps a bar across the wider axis and returns', () => {
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 0, seed: 1 })).toEqual({ axis: 'x', bar: 0 })
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 2_000, seed: 1 }).bar).toBe(bounds.width)
    expect(syncTestState({ periodSec: 4, showGrid: true, showBezels: true }, { bounds, geometry, tMs: 4_000, seed: 1 }).bar).toBe(0)
  })

  it('uses the taller axis for a column canvas', () => {
    const column = resolveGeometry({ ...config, arrangement: 'column' })
    const state = syncTestState(
      { periodSec: 4, showGrid: true, showBezels: true },
      { bounds: { width: column.width, height: column.height }, geometry: column, tMs: 1_000, seed: 1 },
    )
    expect(state.axis).toBe('y')
    expect(state.bar).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/sync-test.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `lib/canvas/scenes/types.ts`**

```ts
import type { LucideIcon } from 'lucide-react'
import type { z } from 'zod'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { CanvasSceneType } from '@/lib/types'

export type SceneContext = {
  bounds: { width: number; height: number }
  geometry: ResolvedGeometry
  tMs: number
  seed: number
  slot: ResolvedSlot
}

export type SceneStateContext = Omit<SceneContext, 'slot'>

type FieldBase = { key: string; label: string; help?: string }

export type SceneField =
  | (FieldBase & { kind: 'number'; min: number; max: number; step?: number })
  | (FieldBase & { kind: 'slider'; min: number; max: number; step: number })
  | (FieldBase & { kind: 'text'; maxLength: number; placeholder?: string })
  | (FieldBase & { kind: 'textarea'; maxLength: number; rows?: number })
  | (FieldBase & { kind: 'lines'; maxLines: number; maxLength: number })
  | (FieldBase & { kind: 'select'; options: { value: string; label: string }[] })
  | (FieldBase & { kind: 'color' })
  | (FieldBase & { kind: 'toggle' })
  | (FieldBase & { kind: 'font' })
  | (FieldBase & { kind: 'style' })
  | (FieldBase & { kind: 'image'; accept: string[]; maxBytes: number })

export type SceneDefinition<TType extends CanvasSceneType, TConfig, TState> = {
  type: TType
  label: string
  description: string
  icon: LucideIcon
  defaultConfig(geometry: ResolvedGeometry): TConfig
  schema: z.ZodType<TConfig>
  fields: SceneField[]
  stateAt(config: TConfig, ctx: SceneStateContext): TState
}
```

`SceneField.key` is a dot path into the scene config (`logo.text`, `tint.mode`). Phase 2's generic form walks it.

- [ ] **Step 4: Create `lib/canvas/scenes/sync-test.ts`**

```ts
import { fold } from '@/lib/canvas/math'
import type { SyncTestConfig } from '@/lib/types'
import type { SceneStateContext } from './types'

export type SyncTestState = { axis: 'x' | 'y'; bar: number }

export function syncTestState(config: SyncTestConfig, ctx: SceneStateContext): SyncTestState {
  const axis = ctx.bounds.width >= ctx.bounds.height ? 'x' : 'y'
  const length = axis === 'x' ? ctx.bounds.width : ctx.bounds.height
  const periodMs = Math.max(1, config.periodSec * 1000)
  return { axis, bar: fold((ctx.tMs / periodMs) * length * 2, length) }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/sync-test.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/scenes/types.ts lib/canvas/scenes/sync-test.ts lib/canvas/__tests__/sync-test.test.ts
git commit -m "feat(canvas): add scene contracts and sync test scene"
```

---

### Task 14: Marquee

**Files:**
- Create: `lib/canvas/scenes/marquee.ts`
- Test: `lib/canvas/__tests__/marquee.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/marquee.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasArrangement, MarqueeConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import {
  coerceDirection,
  copyPosition,
  ensureStrip,
  marqueeState,
  visibleCopies,
  visibleSegments,
} from '@/lib/canvas/scenes/marquee'

const config: MarqueeConfig = {
  lines: ['Hello, wall'],
  layout: 'line',
  separator: '   •   ',
  direction: 'left',
  orientation: 'upright',
  speed: 240,
  repeat: true,
  gap: 100,
  lineHeight: 200,
  fontSize: 160,
  align: 'center',
  crossOffset: 0,
  style: {
    fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center',
    color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
    radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
  },
  strip: { lengthPx: 500, crossPx: 200, segments: [{ text: 'Hello', at: 0, w: 500 }] },
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})

const bounds = { width: geometry.width, height: geometry.height }

describe('coerceDirection', () => {
  it('keeps directions the arrangement allows and replaces the rest', () => {
    expect(coerceDirection('right', 'row')).toBe('right')
    expect(coerceDirection('up', 'row')).toBe('left')
    expect(coerceDirection('down', 'column')).toBe('down')
    expect(coerceDirection('left', 'column')).toBe('up')
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      expect(coerceDirection(direction, 'grid' as CanvasArrangement)).toBe(direction)
    }
  })
})

describe('ensureStrip', () => {
  it('returns a stored strip unchanged', () => {
    expect(ensureStrip(config, bounds)).toBe(config.strip)
  })

  it('derives a block strip without measuring', () => {
    const strip = ensureStrip({ ...config, layout: 'block', lines: ['a', 'b', 'c'], lineHeight: 100, strip: undefined }, bounds)!
    expect(strip.lengthPx).toBe(300)
    expect(strip.crossPx).toBe(bounds.height)
    expect(strip.segments.map((segment) => segment.at)).toEqual([0, 100, 200])
    expect(strip.segments.every((segment) => segment.w === 100)).toBe(true)
  })

  it('estimates a line strip when the API created the scene', () => {
    const strip = ensureStrip({ ...config, strip: undefined, lines: ['abc'] }, bounds)!
    expect(strip.lengthPx).toBeGreaterThan(0)
    expect(strip.crossPx).toBeGreaterThan(0)
    expect(strip.segments).toHaveLength(1)
    expect(strip.segments[0].w).toBe(strip.lengthPx)
  })
})

describe('copyPosition', () => {
  it('starts at the canvas edge and steps by length plus gap', () => {
    expect(copyPosition(config, geometry, 0, 0)).toBe(geometry.width)
    expect(copyPosition(config, geometry, 2000, 1)).toBe(geometry.width - 2000 + 600)
    expect(copyPosition({ ...config, direction: 'right' }, geometry, 0, 0)).toBe(-500)
  })
})

describe('visibleCopies', () => {
  it('enters from the edge at t = 0 for a left marquee', () => {
    expect(visibleCopies(config, geometry, geometry.slots[0], 0)).toEqual([])
    expect(visibleCopies(config, geometry, geometry.slots[1], 0)).toEqual([])
    expect(visibleCopies(config, geometry, geometry.slots[1], 100)).toEqual([0])
  })

  it('shows two copies in the left slot after one travel length', () => {
    expect(visibleCopies(config, geometry, geometry.slots[0], 2000)).toEqual([0, 1])
  })

  it('mirrors the formula for right, up and down', () => {
    expect(visibleCopies({ ...config, direction: 'right' }, geometry, geometry.slots[0], 0)).toEqual([])
    expect(visibleCopies({ ...config, direction: 'right' }, geometry, geometry.slots[0], 500)).toEqual([0])
    expect(visibleCopies({ ...config, direction: 'up' }, geometry, geometry.slots[0], 2000)).toEqual([0, 1, 2, 3])
    expect(visibleCopies({ ...config, direction: 'down' }, geometry, geometry.slots[0], 500)).toEqual([0])
  })

  it('keeps only copy 0 when repeat is off', () => {
    const once = { ...config, repeat: false }
    expect(visibleCopies(once, geometry, geometry.slots[1], 100)).toEqual([0])
    expect(visibleCopies(once, geometry, geometry.slots[1], 3000)).toEqual([])
  })

  it('never returns more than 64 copies', () => {
    const tiny = { ...config, gap: 0, strip: { lengthPx: 1, crossPx: 200, segments: [{ text: 'x', at: 0, w: 1 }] } }
    expect(visibleCopies(tiny, geometry, geometry.slots[0], 0).length).toBeLessThanOrEqual(64)
  })
})

describe('visibleSegments', () => {
  it('culls segments outside the slot window', () => {
    const strip = { lengthPx: 1000, crossPx: 200, segments: [{ text: 'a', at: 0, w: 100 }, { text: 'b', at: 500, w: 100 }, { text: 'c', at: 900, w: 100 }] }
    expect(visibleSegments(strip, 0, 400, 800).map((segment) => segment.text)).toEqual(['b'])
  })
})

describe('marqueeState', () => {
  it('is slot independent and reports travel distance', () => {
    const ctx = { bounds, geometry, tMs: 1000, seed: 1 }
    const state = marqueeState(config, ctx)
    expect(state.axis).toBe('x')
    expect(state.tauPx).toBe(240)
    expect(state.strip).toBe(config.strip)
    expect(marqueeState(config, { ...ctx, seed: 99 })).toEqual(state)
  })

  it('places the strip on the cross axis with align and offset', () => {
    const state = marqueeState({ ...config, align: 'start', crossOffset: 25 }, { bounds, geometry, tMs: 0, seed: 1 })
    expect(state.crossStart).toBe(25)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/marquee.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/scenes/marquee.ts`**

```ts
import type { CanvasArrangement, MarqueeConfig, MarqueeStrip } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { SceneStateContext } from './types'

export type MarqueeState = {
  axis: 'x' | 'y'
  direction: MarqueeConfig['direction']
  tauPx: number
  strip: MarqueeStrip
  crossStart: number
  crossSize: number
  lineHeight: number
  fontSize: number
  orientation: MarqueeConfig['orientation']
  layout: MarqueeConfig['layout']
  repeat: boolean
  gap: number
  style: MarqueeConfig['style']
}

const DEFAULT_SEPARATOR = '   •   '
const MAX_COPIES = 64

export function coerceDirection(direction: MarqueeConfig['direction'], arrangement: CanvasArrangement): MarqueeConfig['direction'] {
  if (arrangement === 'row') return direction === 'right' ? 'right' : 'left'
  if (arrangement === 'column') return direction === 'down' ? 'down' : 'up'
  return direction
}

function travelAxis(direction: MarqueeConfig['direction']): 'x' | 'y' {
  return direction === 'left' || direction === 'right' ? 'x' : 'y'
}

/**
 * Fill a missing strip from stored text or a deterministic estimate. The
 * editor replaces the estimate after measuring; playback never waits for it.
 */
export function ensureStrip(config: MarqueeConfig, bounds: { width: number; height: number }): MarqueeStrip | undefined {
  if (config.strip) return config.strip
  const axis = travelAxis(config.direction)

  if (config.layout === 'block') {
    const cross = axis === 'x' ? bounds.height : bounds.width
    const segments = config.lines.map((line, index) => ({ text: line, at: index * config.lineHeight, w: config.lineHeight }))
    return { lengthPx: Math.max(1, segments.length * config.lineHeight), crossPx: Math.max(1, cross), segments }
  }

  const text = config.lines.join(config.separator || DEFAULT_SEPARATOR)
  if (text.length === 0) return { lengthPx: 1, crossPx: 1, segments: [] }
  const width = Math.max(1, Math.round(text.length * config.fontSize * 0.6))
  return {
    lengthPx: width,
    crossPx: Math.max(1, Math.round(config.fontSize * 1.3)),
    segments: [{ text, at: 0, w: width }],
  }
}

/** Canvas-axis start of copy `j` for the current travel distance. */
export function copyPosition(config: MarqueeConfig, geometry: ResolvedGeometry, tauPx: number, j: number): number {
  const strip = ensureStrip(config, geometry)
  const T = Math.max(1, strip?.lengthPx ?? 1)
  const axis = travelAxis(config.direction)
  const L = axis === 'x' ? geometry.width : geometry.height
  const P = Math.max(1, T + Math.max(0, config.gap))
  const approach = config.direction === 'left' || config.direction === 'up'
  return approach ? L - tauPx + j * P : -T + tauPx - j * P
}

/**
 * Indices of strip copies that intersect this slot window. Only integer j >= 0
 * exist, so content enters from the canvas edge at scene start. Capped at 64.
 */
export function visibleCopies(
  config: MarqueeConfig,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
  tauPx: number,
): number[] {
  const strip = ensureStrip(config, geometry)
  if (!strip) return []

  const axis = travelAxis(config.direction)
  const slotStart = axis === 'x' ? slot.x : slot.y
  const slotEnd = slotStart + (axis === 'x' ? slot.w : slot.h)
  const T = Math.max(1, strip.lengthPx)
  const approach = config.direction === 'left' || config.direction === 'up'
  const copies: number[] = []

  for (let j = 0; j < MAX_COPIES; j++) {
    if (!config.repeat && j > 0) break
    const x = copyPosition(config, geometry, tauPx, j)
    if (x < slotEnd && x + T > slotStart) copies.push(j)
    if (approach && x >= slotEnd) break
    if (!approach && x + T <= slotStart) break
  }

  return copies
}

export function visibleSegments(strip: MarqueeStrip, copyX: number, slotStart: number, slotEnd: number) {
  return strip.segments.filter((segment) => copyX + segment.at < slotEnd && copyX + segment.at + segment.w > slotStart)
}

export function marqueeState(config: MarqueeConfig, ctx: SceneStateContext): MarqueeState {
  const axis = travelAxis(config.direction)
  const strip = ensureStrip(config, ctx.bounds) ?? { lengthPx: 1, crossPx: 1, segments: [] }
  const cross = axis === 'x' ? ctx.bounds.height : ctx.bounds.width
  const crossOffset = config.align === 'start' ? 0 : config.align === 'end' ? cross - strip.crossPx : (cross - strip.crossPx) / 2

  return {
    axis,
    direction: config.direction,
    tauPx: (Math.max(0, ctx.tMs) / 1000) * config.speed,
    strip,
    crossStart: crossOffset + config.crossOffset,
    crossSize: cross,
    lineHeight: config.lineHeight,
    fontSize: config.fontSize,
    orientation: config.orientation,
    layout: config.layout,
    repeat: config.repeat,
    gap: config.gap,
    style: config.style,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/marquee.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/marquee.ts lib/canvas/__tests__/marquee.test.ts
git commit -m "feat(canvas): add marquee geometry and copy culling"
```

---

### Task 15: Bounce

**Files:**
- Create: `lib/canvas/scenes/bounce.ts`
- Test: `lib/canvas/__tests__/bounce.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/bounce.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BounceConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { bounceState, bouncePosition } from '@/lib/canvas/scenes/bounce'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: BounceConfig = {
  logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style, w: 100, h: 100 },
  speed: 900,
  angleDeg: 45,
  startMode: 'center',
  tint: { mode: 'cycle', colors: ['#ff0000', '#00ff00', '#0000ff'], fixed: '#ffffff' },
  cornerCelebration: true,
  trail: { enabled: false, length: 0, spacingMs: 80 },
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})

const bounds = { width: 1000, height: 1000 }
const ctx = { bounds, geometry, tMs: 0, seed: 11 }

describe('bouncePosition', () => {
  it('stays inside the usable range for many timestamps', () => {
    for (let k = 0; k < 20_000; k++) {
      const t = (k * 0.731) % 20_000
      const position = bouncePosition(config, bounds, t, 11)
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(900)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(900)
    }
  })

  it('is deterministic and finite after a day', () => {
    expect(bouncePosition(config, bounds, 3.5, 11)).toEqual(bouncePosition(config, bounds, 3.5, 11))
    const late = bouncePosition(config, bounds, 86_400, 11)
    expect(Number.isFinite(late.x)).toBe(true)
    expect(Number.isFinite(late.y)).toBe(true)
    expect(late.bounces).toBeGreaterThan(0)
  })

  it('counts bounces monotonically', () => {
    expect(bouncePosition(config, bounds, 10, 11).bounces).toBeGreaterThanOrEqual(bouncePosition(config, bounds, 1, 11).bounces)
  })
})

describe('bounceState', () => {
  it('detects the first corner hit for a centred 45 degree logo', () => {
    const state = bounceState(config, { ...ctx, tMs: (900 / (900 * Math.cos(Math.PI / 4))) / 2 * 1000 })
    expect(state.cornerAgeMs).not.toBeNull()
    expect(state.cornerAgeMs!).toBeLessThan(1)
  })

  it('cycles the tint on every bounce', () => {
    const a = bounceState(config, { ...ctx, tMs: 0 })
    const b = bounceState(config, { ...ctx, tMs: 2_000 })
    expect(a.color).not.toBeNull()
    expect(b.color).not.toBeNull()
    expect(a.color).not.toBe(b.color)
  })

  it('produces an analytic trail without history', () => {
    const trail = { ...config, trail: { enabled: true, length: 4, spacingMs: 100 } }
    const state = bounceState(trail, { ...ctx, tMs: 3_000 })
    const late = bounceState(trail, { ...ctx, tMs: 30_000 })
    expect(state.trail).toHaveLength(4)
    expect(late.trail).toEqual(
      [400, 300, 200, 100].map((ms) => {
        const point = bouncePosition(trail, bounds, 30 - ms / 1000, 11)
        return { x: point.x, y: point.y }
      }),
    )
  })

  it('is slot independent', () => {
    expect(bounceState(config, { ...ctx, tMs: 5_000 })).toEqual(bounceState(config, { ...ctx, tMs: 5_000 }))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/bounce.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/scenes/bounce.ts`**

```ts
import type { BounceConfig } from '@/lib/types'
import { fold } from '@/lib/canvas/math'
import { hash01, pickIndex } from '@/lib/canvas/prng'
import type { SceneStateContext } from './types'

export type BouncePosition = {
  x: number
  y: number
  bounces: number
  hitsX: number
  hitsY: number
  ux: number
  uy: number
  left: number
  top: number
}

export type BounceState = {
  x: number
  y: number
  w: number
  h: number
  bounces: number
  color: string | null
  cornerAgeMs: number | null
  trail: { x: number; y: number }[]
}

function motion(speed: number, u0: number, range: number, seconds: number) {
  const u = u0 + speed * seconds
  const hits = Math.floor(u / range) - Math.floor(u0 / range)
  return { u, position: fold(u, range), hits }
}

/**
 * Analytic DVD bounce. `tSec` is scene-local seconds; the same inputs always
 * produce the same position, so every frame agrees without any history.
 */
export function bouncePosition(config: BounceConfig, bounds: { width: number; height: number }, tSec: number, seed: number): BouncePosition {
  const w = config.logo.w
  const h = config.logo.h
  const rx = Math.max(1, bounds.width - w)
  const ry = Math.max(1, bounds.height - h)
  const angle = ((config.angleDeg ?? 20 + hash01(seed, 1) * 50) * Math.PI) / 180
  const sx = hash01(seed, 2) < 0.5 ? -1 : 1
  const sy = hash01(seed, 3) < 0.5 ? -1 : 1
  const vx = Math.abs(config.speed * Math.cos(angle))
  const vy = Math.abs(config.speed * Math.sin(angle))
  const startX = config.startMode === 'center' ? rx / 2 : hash01(seed, 4) * rx
  const startY = config.startMode === 'center' ? ry / 2 : hash01(seed, 5) * ry
  const u0x = sx > 0 ? startX : 2 * rx - startX
  const u0y = sy > 0 ? startY : 2 * ry - startY
  const mx = motion(vx, u0x, rx, tSec)
  const my = motion(vy, u0y, ry, tSec)

  return {
    x: mx.position,
    y: my.position,
    bounces: mx.hits + my.hits,
    hitsX: mx.hits,
    hitsY: my.hits,
    ux: mx.u,
    uy: my.u,
    left: u0x,
    top: u0y,
  }
}

function lastHitSeconds(u: number, u0: number, range: number, speed: number): number | null {
  const hit = Math.floor(u / range)
  if (hit < 1) return null
  return (hit * range - u0) / speed
}

export function bounceState(config: BounceConfig, ctx: SceneStateContext): BounceState {
  const tSec = Math.max(0, ctx.tMs / 1000)
  const position = bouncePosition(config, ctx.bounds, tSec, ctx.seed)
  const colors = config.tint.colors
  const base = pickIndex(ctx.seed, 9, Math.max(1, colors.length))
  const color =
    config.tint.mode === 'cycle'
      ? colors[(base + position.bounces) % colors.length] ?? null
      : config.tint.mode === 'fixed'
        ? config.tint.fixed
        : null

  const rx = Math.max(1, ctx.bounds.width - config.logo.w)
  const ry = Math.max(1, ctx.bounds.height - config.logo.h)
  const angle = ((config.angleDeg ?? 20 + hash01(ctx.seed, 1) * 50) * Math.PI) / 180
  const vx = Math.abs(config.speed * Math.cos(angle))
  const vy = Math.abs(config.speed * Math.sin(angle))
  const tx = lastHitSeconds(position.ux, position.left, rx, vx)
  const ty = lastHitSeconds(position.uy, position.top, ry, vy)
  let cornerAgeMs: number | null = null
  if (tx !== null && ty !== null) {
    const hitAt = Math.max(tx, ty)
    if (Math.abs(tx - ty) <= 0.04 && hitAt >= 0) cornerAgeMs = Math.max(0, (tSec - hitAt) * 1000)
  }

  const trail = config.trail.enabled
    ? Array.from({ length: config.trail.length }, (_, index) => {
        const t = Math.max(0, tSec - ((index + 1) * config.trail.spacingMs) / 1000)
        const point = bouncePosition(config, ctx.bounds, t, ctx.seed)
        return { x: point.x, y: point.y }
      })
    : []

  return { x: position.x, y: position.y, w: config.logo.w, h: config.logo.h, bounces: position.bounces, color, cornerAgeMs, trail }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/bounce.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/bounce.ts lib/canvas/__tests__/bounce.test.ts
git commit -m "feat(canvas): add analytic bounce scene"
```

---

### Task 16: Pong

**Files:**
- Create: `lib/canvas/scenes/pong.ts`
- Test: `lib/canvas/__tests__/pong.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/pong.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PongConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { pointPlan, pongState, pongTiming } from '@/lib/canvas/scenes/pong'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: PongConfig = {
  axis: 'auto',
  paddle: { w: 24, h: 220, inset: 40 },
  ballSize: 28,
  baseSpeed: 900,
  rallyHits: [2, 7],
  pointsPerMatch: 7,
  serveDelayMs: 900,
  pointPauseMs: 1200,
  showScore: true,
  colors: { ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
  scoreStyle: style,
}

const row = resolveGeometry({
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const column = resolveGeometry({
  arrangement: 'column', gap: 0, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const bounds = { width: row.width, height: row.height }
const columnBounds = { width: column.width, height: column.height }

describe('pongTiming', () => {
  it('derives a bounded point duration and flight time', () => {
    const timing = pongTiming(config, bounds)
    expect(timing.pointSec).toBeGreaterThanOrEqual(4)
    expect(timing.pointSec).toBeLessThanOrEqual(60)
    expect(timing.flightSec).toBeGreaterThan(0)
    expect(timing.matchSlots).toBe(8)
  })

  it('plays along the longer dimension for auto', () => {
    expect(pongTiming(config, bounds).axis).toBe('horizontal')
    expect(pongTiming(config, columnBounds).axis).toBe('vertical')
    expect(pongTiming({ ...config, axis: 'vertical' }, bounds).axis).toBe('vertical')
    expect(pongTiming({ ...config, axis: 'horizontal' }, columnBounds).axis).toBe('horizontal')
  })
})

describe('pointPlan', () => {
  it('chooses a rally length with the right parity for the loser', () => {
    for (let k = 0; k < 7; k++) {
      const plan = pointPlan(config, bounds, 5, 0, k)
      const receiverOfFinal = plan.n % 2 === 1 ? 1 - plan.server : plan.server
      expect(receiverOfFinal).toBe(plan.loser)
      expect(plan.n).toBeGreaterThanOrEqual(config.rallyHits[0])
      expect(plan.n).toBeLessThanOrEqual(config.rallyHits[1])
    }
  })

  it('is deterministic', () => {
    expect(pointPlan(config, bounds, 5, 0, 3)).toEqual(pointPlan(config, bounds, 5, 0, 3))
  })
})

describe('pongState', () => {
  it('returns finite values for a day of play', () => {
    for (let k = 0; k < 20_000; k++) {
      const state = pongState(config, { bounds, geometry: row, tMs: (k * 977) % 86_400_000, seed: 5 })
      expect(Number.isFinite(state.ball.x)).toBe(true)
      expect(Number.isFinite(state.ball.y)).toBe(true)
      expect(Number.isFinite(state.paddles[0])).toBe(true)
      expect(Number.isFinite(state.paddles[1])).toBe(true)
    }
  })

  it('keeps paddles inside the field and the ball inside the cross axis', () => {
    const timing = pongTiming(config, bounds)
    for (let k = 0; k < 5_000; k++) {
      const state = pongState(config, { bounds, geometry: row, tMs: k * 370, seed: 5 })
      expect(state.paddles[0]).toBeGreaterThanOrEqual(0)
      expect(state.paddles[0]).toBeLessThanOrEqual(timing.B - config.paddle.h)
      expect(state.paddles[1]).toBeGreaterThanOrEqual(0)
      expect(state.paddles[1]).toBeLessThanOrEqual(timing.B - config.paddle.h)
      if (state.ball.visible) {
        expect(state.ball.y).toBeGreaterThanOrEqual(config.ballSize / 2 - 1e-6)
        expect(state.ball.y).toBeLessThanOrEqual(timing.B - config.ballSize / 2 + 1e-6)
      }
    }
  })

  it('lands the ball within half a paddle at every hit and outside it at the miss', () => {
    const timing = pongTiming(config, bounds)
    const k = 2
    const slotStart = k * timing.pointSec
    const plan = pointPlan(config, bounds, 5, 0, k)
    const missS = plan.serveDelaySec + (plan.n - 1) * plan.tau + plan.missTau
    expect(missS).toBeCloseTo(plan.serveDelaySec + timing.flightSec, 6)
    for (let j = 1; j <= plan.n; j++) {
      const s = j < plan.n ? plan.serveDelaySec + j * plan.tau : missS
      const state = pongState(config, { bounds, geometry: row, tMs: (slotStart + s) * 1000, seed: 5 })
      const receiverSide = j % 2 === 1 ? 1 - plan.server : plan.server
      const paddleCenter = state.paddles[receiverSide] + config.paddle.h / 2
      if (j < plan.n) {
        expect(Math.abs(state.ball.y - paddleCenter)).toBeLessThanOrEqual(config.paddle.h / 2 + 1e-6)
      } else {
        expect(Math.abs(state.ball.y - paddleCenter)).toBeGreaterThan(config.paddle.h / 2)
      }
      expect(s).toBeLessThan(timing.pointSec)
    }
  })

  it('keeps scores monotonic inside a match, shows a banner and resets', () => {
    const timing = pongTiming(config, bounds)
    let previous = -1
    for (let t = 0; t < timing.pointSec * timing.matchSlots; t += 100) {
      const state = pongState(config, { bounds, geometry: row, tMs: t * 1000, seed: 5 })
      expect(state.score[0] + state.score[1]).toBeGreaterThanOrEqual(previous)
      previous = state.score[0] + state.score[1]
    }
    const banner = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec * config.pointsPerMatch + 0.5) * 1000, seed: 5 })
    expect(banner.phase).toBe('banner')
    expect(banner.banner).toMatch(/WINS|DRAW/)
    expect(banner.score[0] + banner.score[1]).toBe(config.pointsPerMatch)
    const nextMatch = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec * timing.matchSlots + 0.1) * 1000, seed: 5 })
    expect(nextMatch.score).toEqual([0, 0])
  })

  it('is continuous across a slot boundary', () => {
    const timing = pongTiming(config, bounds)
    const before = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec - 0.001) * 1000, seed: 5 })
    const after = pongState(config, { bounds, geometry: row, tMs: timing.pointSec * 1000 + 1, seed: 5 })
    expect(Math.abs(before.paddles[0] - after.paddles[0])).toBeLessThan(2)
    expect(Math.abs(before.paddles[1] - after.paddles[1])).toBeLessThan(2)
  })

  it('is slot independent and reports the vertical axis for a column canvas', () => {
    expect(pongState(config, { bounds, geometry: row, tMs: 12_345, seed: 5 })).toEqual(
      pongState(config, { bounds, geometry: row, tMs: 12_345, seed: 5 }),
    )
    expect(pongState(config, { bounds: columnBounds, geometry: column, tMs: 12_345, seed: 5 }).axis).toBe('vertical')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/pong.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/scenes/pong.ts`**

```ts
import type { PongConfig } from '@/lib/types'
import { clamp, fold, lerp, smoothstep } from '@/lib/canvas/math'
import { hash01, sampleInt } from '@/lib/canvas/prng'
import type { SceneStateContext } from './types'

export type PongAxis = 'horizontal' | 'vertical'

export type PongTiming = {
  axis: PongAxis
  A: number
  B: number
  xL: number
  xR: number
  D: number
  O: number
  Rb: number
  bs: number
  pointSec: number
  flightSec: number
  serveDelaySec: number
  pauseSec: number
  matchSlots: number
}

export type PongPointPlan = {
  server: 0 | 1
  winner: 0 | 1
  loser: 0 | 1
  n: number
  vu: number
  vv: number
  tau: number
  missTau: number
  phi: number
  ballTop0: number
  serveDelaySec: number
}

export type PongState = {
  phase: 'serve' | 'flight' | 'pause' | 'banner'
  ball: { x: number; y: number; visible: boolean }
  paddles: [number, number]
  score: [number, number]
  banner: string | null
  axis: PongAxis
}

type PaddleEvent = { t: number; y: number }

export function pongTiming(config: PongConfig, bounds: { width: number; height: number }): PongTiming {
  const axis: PongAxis =
    config.axis === 'auto' ? (bounds.width >= bounds.height ? 'horizontal' : 'vertical') : config.axis
  const A = axis === 'horizontal' ? bounds.width : bounds.height
  const B = axis === 'horizontal' ? bounds.height : bounds.width
  const xL = config.paddle.inset + config.paddle.w
  const xR = A - config.paddle.inset - config.paddle.w
  const D = Math.max(1, xR - xL - config.ballSize)
  const O = config.paddle.inset + config.paddle.w + config.ballSize
  const Rb = Math.max(1, B - config.ballSize)
  const avgHits = (config.rallyHits[0] + config.rallyHits[1]) / 2
  const fixed = (config.serveDelayMs + config.pointPauseMs) / 1000
  const pointSec = Math.min(60, Math.max(4, fixed + 0.1, fixed + (avgHits * D + O) / config.baseSpeed))

  return {
    axis,
    A,
    B,
    xL,
    xR,
    D,
    O,
    Rb,
    bs: config.ballSize,
    pointSec,
    flightSec: pointSec - fixed,
    serveDelaySec: config.serveDelayMs / 1000,
    pauseSec: config.pointPauseMs / 1000,
    matchSlots: config.pointsPerMatch + 1,
  }
}

function face(timing: PongTiming, side: 0 | 1): number {
  return side === 0 ? timing.xL : timing.xR
}

function restY(seed: number, matchIndex: number, k: number, side: 0 | 1, timing: PongTiming, config: PongConfig): number {
  const center = (timing.B - config.paddle.h) / 2
  const spread = (hash01(seed, matchIndex * 211 + k * 19 + side + 6) - 0.5) * 0.4 * (timing.B - config.paddle.h)
  return clamp(center + spread, 0, timing.B - config.paddle.h)
}

export function pointPlan(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
): PongPointPlan {
  const timing = pongTiming(config, bounds)
  const server = (k % 2) as 0 | 1
  const winner = (hash01(seed, matchIndex * 131 + k * 17 + 3) < 0.5 ? 0 : 1) as 0 | 1
  const loser = (1 - winner) as 0 | 1
  const wantParity = loser === 1 - server ? 1 : 0
  const candidates: number[] = []
  for (let n = config.rallyHits[0]; n <= config.rallyHits[1]; n += 1) {
    if (n % 2 === wantParity) candidates.push(n)
  }
  const n =
    candidates.length > 0
      ? candidates[sampleInt(seed, matchIndex * 131 + k * 17 + 4, 0, candidates.length - 1)]
      : config.rallyHits[0]
  const vu = (n * timing.D + timing.O) / timing.flightSec
  const degrees = 8 + hash01(seed, matchIndex * 97 + k * 13 + 1) * 24
  const sign = hash01(seed, matchIndex * 97 + k * 13 + 2) < 0.5 ? -1 : 1
  const phi = (degrees * Math.PI * sign) / 180
  const vv = vu * Math.tan(phi)
  const ballTop0 = 0.15 * timing.Rb + hash01(seed, matchIndex * 131 + k * 17 + 5) * 0.7 * timing.Rb

  return {
    server, winner, loser, n, vu, vv,
    tau: timing.D / vu,
    missTau: (timing.D + timing.O) / vu,
    phi, ballTop0, serveDelaySec: timing.serveDelaySec,
  }
}

function missAt(plan: PongPointPlan): number {
  return plan.serveDelaySec + (plan.n - 1) * plan.tau + plan.missTau
}

function ballCenterAt(plan: PongPointPlan, timing: PongTiming, s: number): { x: number; y: number } {
  const a = Math.max(0, s - plan.serveDelaySec)
  const rallyEnd = (plan.n - 1) * plan.tau
  const j = a < rallyEnd ? Math.floor(a / plan.tau) + 1 : plan.n
  const legStart = (j - 1) * plan.tau
  const legTau = j === plan.n ? plan.missTau : plan.tau
  const q = clamp(a - legStart, 0, legTau)
  const start = j % 2 === 1 ? face(timing, plan.server) : face(timing, (1 - plan.server) as 0 | 1)
  const direction = (j % 2 === 1) === (plan.server === 0) ? 1 : -1
  const distance = j < plan.n ? timing.D : timing.D + timing.O
  return {
    x: start + direction * distance * (q / legTau),
    y: fold(plan.ballTop0 + plan.vv * a, timing.Rb) + timing.bs / 2,
  }
}

function startPositions(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  slotIndex: number,
): [number, number] {
  const timing = pongTiming(config, bounds)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const center = (timing.B - config.paddle.h) / 2
  if (k === config.pointsPerMatch) return [center, center]

  const plan = pointPlan(config, bounds, seed, matchIndex, k)
  const serverY = clamp(plan.ballTop0 + timing.bs / 2 - config.paddle.h / 2, 0, timing.B - config.paddle.h)
  const receiverSide = (1 - plan.server) as 0 | 1
  const receiverY = restY(seed, matchIndex, k, receiverSide, timing, config)
  return plan.server === 0 ? [serverY, receiverY] : [receiverY, serverY]
}

function track(events: PaddleEvent[], s: number, timing: PongTiming, config: PongConfig): number {
  if (events.length === 0) return (timing.B - config.paddle.h) / 2
  if (s <= events[0].t) return events[0].y
  for (let index = 1; index < events.length; index++) {
    const a = events[index - 1]
    const b = events[index]
    if (s <= b.t) {
      const span = b.t - a.t
      if (span <= 1e-9) return b.y
      const moveAt = a.t + 0.25 * span
      if (s <= moveAt) return a.y
      return lerp(a.y, b.y, smoothstep((s - moveAt) / (b.t - moveAt)))
    }
  }
  return events[events.length - 1].y
}

function missY(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
  ballCenterY: number,
): number {
  const timing = pongTiming(config, bounds)
  const base = ballCenterY - config.paddle.h / 2
  const offset = 0.75 * config.paddle.h + config.ballSize / 2 + 30 + 40 * hash01(seed, matchIndex * 131 + k * 17 + 7)
  const sign = hash01(seed, matchIndex * 131 + k * 17 + 8) < 0.5 ? -1 : 1
  const optionA = clamp(base + sign * offset, 0, timing.B - config.paddle.h)
  const optionB = clamp(base - sign * offset, 0, timing.B - config.paddle.h)
  const separationA = Math.abs(optionA + config.paddle.h / 2 - ballCenterY)
  const separationB = Math.abs(optionB + config.paddle.h / 2 - ballCenterY)
  return separationA >= separationB ? optionA : optionB
}

function paddlePositions(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  slotIndex: number,
  s: number,
): [number, number] {
  const timing = pongTiming(config, bounds)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const center = (timing.B - config.paddle.h) / 2
  const nextStart = startPositions(config, bounds, seed, slotIndex + 1)

  if (k === config.pointsPerMatch) {
    const easeStart = timing.pointSec - timing.pauseSec
    const p = clamp((s - easeStart) / Math.max(0.001, timing.pauseSec), 0, 1)
    return [lerp(center, nextStart[0], smoothstep(p)), lerp(center, nextStart[1], smoothstep(p))]
  }

  const plan = pointPlan(config, bounds, seed, matchIndex, k)
  const start = startPositions(config, bounds, seed, slotIndex)
  const events: [PaddleEvent[], PaddleEvent[]] = [[{ t: 0, y: start[0] }], [{ t: 0, y: start[1] }]]

  for (let j = 1; j < plan.n; j++) {
    const receiver = (j % 2 === 1 ? 1 - plan.server : plan.server) as 0 | 1
    const hitAt = plan.serveDelaySec + j * plan.tau
    const centerY = ballCenterAt(plan, timing, hitAt).y
    events[receiver].push({ t: hitAt, y: clamp(centerY - config.paddle.h / 2, 0, timing.B - config.paddle.h) })
  }

  const miss = missAt(plan)
  const missCenter = ballCenterAt(plan, timing, miss).y
  events[plan.loser].push({ t: miss, y: missY(config, bounds, seed, matchIndex, k, missCenter) })

  const pauseStart = plan.serveDelaySec + timing.flightSec
  if (s <= pauseStart) {
    return [track(events[0], s, timing, config), track(events[1], s, timing, config)]
  }

  const p = clamp((s - pauseStart) / Math.max(0.001, timing.pauseSec), 0, 1)
  return [
    lerp(track(events[0], pauseStart, timing, config), nextStart[0], smoothstep(p)),
    lerp(track(events[1], pauseStart, timing, config), nextStart[1], smoothstep(p)),
  ]
}

function addWinner(score: [number, number], winner: 0 | 1): void {
  score[winner] += 1
}

function scoreFor(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
  s: number,
  plan: PongPointPlan,
): [number, number] {
  const score: [number, number] = [0, 0]
  for (let i = 0; i < k; i++) addWinner(score, pointPlan(config, bounds, seed, matchIndex, i).winner)
  if (s >= missAt(plan)) addWinner(score, plan.winner)
  return score
}

export function pongState(config: PongConfig, ctx: SceneStateContext): PongState {
  const timing = pongTiming(config, ctx.bounds)
  const t = Math.max(0, ctx.tMs / 1000)
  const slotIndex = Math.floor(t / timing.pointSec)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const s = t - slotIndex * timing.pointSec
  const paddles = paddlePositions(config, ctx.bounds, ctx.seed, slotIndex, s)

  if (k === config.pointsPerMatch) {
    const score: [number, number] = [0, 0]
    for (let i = 0; i < config.pointsPerMatch; i++) {
      addWinner(score, pointPlan(config, ctx.bounds, ctx.seed, matchIndex, i).winner)
    }
    const banner = score[0] === score[1] ? 'DRAW' : score[0] > score[1] ? 'LEFT WINS' : 'RIGHT WINS'
    return { phase: 'banner', ball: { x: 0, y: 0, visible: false }, paddles, score, banner, axis: timing.axis }
  }

  const plan = pointPlan(config, ctx.bounds, ctx.seed, matchIndex, k)
  const phase: PongState['phase'] =
    s < plan.serveDelaySec ? 'serve' : s < plan.serveDelaySec + timing.flightSec ? 'flight' : 'pause'
  const center = ballCenterAt(plan, timing, s)
  const ball =
    phase === 'serve'
      ? { x: face(timing, plan.server), y: plan.ballTop0 + timing.bs / 2, visible: true }
      : { x: center.x, y: center.y, visible: phase === 'flight' }

  return {
    phase,
    ball,
    paddles,
    score: scoreFor(config, ctx.bounds, ctx.seed, matchIndex, k, s, plan),
    banner: null,
    axis: timing.axis,
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/pong.test.ts`
Expected: PASS. The continuity test compares `pointSec - 1ms` with the first millisecond of the next slot; both sides use `startPositions`, so the tolerance is only the sub-millisecond sampling difference.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/pong.ts lib/canvas/__tests__/pong.test.ts
git commit -m "feat(canvas): add scripted deterministic pong scene"
```

---

### Task 17: Scene registry

**Files:**
- Create: `lib/canvas/scenes/registry.ts`
- Test: `lib/canvas/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasSceneType } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { SCENE_META, coerceScene, computeSceneState, defaultScene, sceneStateAt } from '@/lib/canvas/scenes/registry'

const config: CanvasConfig = {
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
}
const geometry = resolveGeometry(config)
const types: CanvasSceneType[] = ['marquee', 'bounce', 'pong', 'sync-test']

describe('SCENE_META', () => {
  it('describes every scene type', () => {
    for (const type of types) {
      expect(SCENE_META[type].label.length).toBeGreaterThan(0)
      expect(SCENE_META[type].description.length).toBeGreaterThan(0)
      expect(SCENE_META[type].icon).toBeDefined()
    }
  })
})

describe('defaultScene', () => {
  it('creates a valid scene for every type with a unique id', () => {
    const ids = new Set<string>()
    for (const type of types) {
      const scene = defaultScene(type, geometry)
      expect(scene.type).toBe(type)
      expect(scene.id.length).toBeGreaterThan(0)
      expect(canvasSceneSchema.safeParse(scene).success).toBe(true)
      ids.add(scene.id)
    }
    expect(ids.size).toBe(types.length)
  })
})

describe('coerceScene', () => {
  it('coerces an invalid marquee direction and fills the strip', () => {
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const up = { ...base, config: { ...base.config, direction: 'up' as const, strip: undefined } }
    const coerced = coerceScene(up, 'row', geometry)
    if (coerced.type !== 'marquee') throw new Error('wrong scene')
    expect(coerced.config.direction).toBe('left')
    expect(coerced.config.strip?.lengthPx).toBeGreaterThan(0)
    expect(canvasSceneSchema.safeParse(coerced).success).toBe(true)
  })

  it('leaves a valid direction alone', () => {
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const right = { ...base, config: { ...base.config, direction: 'right' as const } }
    const coerced = coerceScene(right, 'row', geometry)
    if (coerced.type !== 'marquee') throw new Error('wrong scene')
    expect(coerced.config.direction).toBe('right')
  })
})

describe('computeSceneState', () => {
  it('dispatches by scene type and narrows the state', () => {
    const marquee = computeSceneState(defaultScene('marquee', geometry), { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(marquee.type).toBe('marquee')
    if (marquee.type === 'marquee') expect(marquee.state.axis).toBe('x')

    const pong = computeSceneState(defaultScene('pong', geometry), { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(pong.type).toBe('pong')
    if (pong.type === 'pong') expect(pong.state.phase).toBe('serve')
  })

  it('keeps the config on the result', () => {
    const scene = defaultScene('sync-test', geometry)
    const result = computeSceneState(scene, { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1 })
    expect(result.config).toEqual(scene.config)
  })
})

describe('sceneStateAt', () => {
  it('is the public alias for computeSceneState', () => {
    const scene = defaultScene('pong', geometry)
    const ctx = { bounds: { width: geometry.width, height: geometry.height }, geometry, tMs: 0, seed: 1, slot: geometry.slots[0] }
    expect(sceneStateAt(scene, ctx)).toEqual(computeSceneState(scene, ctx))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/registry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/canvas/scenes/registry.ts`**

```ts
import { nanoid } from 'nanoid'
import { CircleDot, Crosshair, Gamepad2, Type, type LucideIcon } from 'lucide-react'
import type {
  BounceConfig,
  CanvasArrangement,
  CanvasScene,
  CanvasSceneType,
  MarqueeConfig,
  PongConfig,
  SyncTestConfig,
  WidgetStyle,
} from '@/lib/types'
import type { ResolvedGeometry } from '@/lib/canvas/geometry'
import { DEFAULT_STYLE } from '@/lib/widgets'
import { coerceDirection, ensureStrip, marqueeState, type MarqueeState } from './marquee'
import { bounceState, type BounceState } from './bounce'
import { pongState, type PongState } from './pong'
import { syncTestState, type SyncTestState } from './sync-test'
import type { SceneContext, SceneStateContext } from './types'

export type SceneMeta = { label: string; description: string; icon: LucideIcon }

export const SCENE_META: Record<CanvasSceneType, SceneMeta> = {
  marquee: { label: 'Marquee', description: 'Scrolling text that crosses every bezel', icon: Type },
  bounce: { label: 'Bounce', description: 'A logo that bounces around the whole wall', icon: CircleDot },
  pong: { label: 'Pong', description: 'A scripted rally that spans the wall', icon: Gamepad2 },
  'sync-test': { label: 'Sync test', description: 'Sweep bar, grid and slot labels for calibration', icon: Crosshair },
}

export type SceneRenderState =
  | { type: 'marquee'; config: MarqueeConfig; state: MarqueeState }
  | { type: 'bounce'; config: BounceConfig; state: BounceState }
  | { type: 'pong'; config: PongConfig; state: PongState }
  | { type: 'sync-test'; config: SyncTestConfig; state: SyncTestState }

const TEXT_STYLE: WidgetStyle = {
  ...DEFAULT_STYLE,
  fontFamily: 'bebas',
  fontWeight: 700,
  color: '#ffffff',
  accent: '#7cc4ff',
  shadow: false,
}

export function defaultScene(type: CanvasSceneType, geometry: ResolvedGeometry): CanvasScene {
  const base = { id: nanoid(8), name: SCENE_META[type].label, enabled: true, seed: Math.floor(Math.random() * 2_147_483_647) - 1_073_741_824 }

  if (type === 'marquee') {
    const config: MarqueeConfig = {
      lines: ['Hello, wall'],
      layout: 'line',
      separator: '   •   ',
      direction: geometry.width >= geometry.height ? 'left' : 'up',
      orientation: 'upright',
      speed: 240,
      repeat: true,
      gap: 600,
      lineHeight: 200,
      fontSize: 160,
      align: 'center',
      crossOffset: 0,
      style: TEXT_STYLE,
    }
    return { ...base, type, durationSec: 60, config }
  }

  if (type === 'bounce') {
    const config: BounceConfig = {
      logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style: TEXT_STYLE, w: 300, h: 140 },
      speed: 280,
      angleDeg: null,
      startMode: 'seed',
      tint: { mode: 'none', colors: ['#e11d48', '#f59e0b', '#22c55e', '#3b82f6'], fixed: '#ffffff' },
      cornerCelebration: true,
      trail: { enabled: false, length: 0, spacingMs: 80 },
    }
    return { ...base, type, durationSec: 120, config }
  }

  if (type === 'pong') {
    const config: PongConfig = {
      axis: 'auto',
      paddle: { w: 24, h: 220, inset: 40 },
      ballSize: 28,
      baseSpeed: 900,
      rallyHits: [2, 7],
      pointsPerMatch: 7,
      serveDelayMs: 900,
      pointPauseMs: 1200,
      showScore: true,
      colors: { ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
      scoreStyle: TEXT_STYLE,
    }
    return { ...base, type, durationSec: 300, config }
  }

  const config: SyncTestConfig = { periodSec: 4, showGrid: true, showBezels: true }
  return { ...base, type: 'sync-test', durationSec: 30, config }
}

export function coerceScene(scene: CanvasScene, arrangement: CanvasArrangement, geometry: ResolvedGeometry): CanvasScene {
  if (scene.type !== 'marquee') return scene
  const direction = coerceDirection(scene.config.direction, arrangement)
  const config = { ...scene.config, direction }
  const strip = ensureStrip(config, { width: geometry.width, height: geometry.height })
  return { ...scene, config: { ...config, strip } }
}

export function computeSceneState(scene: CanvasScene, ctx: SceneStateContext): SceneRenderState {
  switch (scene.type) {
    case 'marquee':
      return { type: 'marquee', config: scene.config, state: marqueeState(scene.config, ctx) }
    case 'bounce':
      return { type: 'bounce', config: scene.config, state: bounceState(scene.config, ctx) }
    case 'pong':
      return { type: 'pong', config: scene.config, state: pongState(scene.config, ctx) }
    case 'sync-test':
      return { type: 'sync-test', config: scene.config, state: syncTestState(scene.config, ctx) }
    default: {
      const exhaustive: never = scene
      return exhaustive
    }
  }
}

export function sceneStateAt(scene: CanvasScene, ctx: SceneContext): SceneRenderState {
  return computeSceneState(scene, ctx)
}
```

The code above is the complete module.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/scenes/registry.ts lib/canvas/__tests__/registry.test.ts
git commit -m "feat(canvas): register the four phase 1 scenes"
```

---

### Task 18: Continuity test

**Files:**
- Test: `lib/canvas/__tests__/continuity.test.ts`

- [ ] **Step 1: Write the test**

Create `lib/canvas/__tests__/continuity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig, MarqueeConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { computeSceneState, defaultScene } from '@/lib/canvas/scenes/registry'
import { visibleCopies } from '@/lib/canvas/scenes/marquee'

function config(overrides: Partial<CanvasConfig>): CanvasConfig {
  return {
    arrangement: 'row', gap: 0, align: 'center',
    slots: [
      { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
      { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
    ],
    background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
    ...overrides,
  }
}

const geometries = [
  resolveGeometry(config({ gap: 0 })),
  resolveGeometry(config({ gap: 120 })),
  resolveGeometry(config({
    gap: 60,
    slots: ['a', 'b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
  })),
  resolveGeometry(config({
    arrangement: 'column',
    slots: ['a', 'b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
  })),
  resolveGeometry(config({
    arrangement: 'grid',
    gridColumns: 2,
    slots: ['a', 'b', 'c', 'd'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
  })),
]

describe('scene state is identical on every frame', () => {
  for (const [index, geometry] of geometries.entries()) {
    it(`holds for geometry ${index}`, () => {
      const bounds = { width: geometry.width, height: geometry.height }
      for (const type of ['marquee', 'bounce', 'pong', 'sync-test'] as const) {
        const scene = defaultScene(type, geometry)
        for (const tMs of [0, 1_000, 12_345, 3_600_000]) {
          const first = computeSceneState(scene, { bounds, geometry, tMs, seed: 7 })
          expect(computeSceneState(scene, { bounds, geometry, tMs, seed: 7 })).toEqual(first)
        }
      }
    })
  }
})

describe('a marquee copy that straddles a bezel has one canvas position', () => {
  it('appears in both slots at the same x with a gap', () => {
    const geometry = geometries[1]
    const strip = { lengthPx: 2000, crossPx: 200, segments: [{ text: 'x', at: 0, w: 2000 }] }
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const marquee: MarqueeConfig = { ...base.config, direction: 'left', gap: 0, strip }
    const [a, b] = geometry.slots
    const tau = geometry.width - 900

    expect(visibleCopies(marquee, geometry, a, tau)).toContain(0)
    expect(visibleCopies(marquee, geometry, b, tau)).toContain(0)
    const canvasX = geometry.width - tau
    expect(canvasX).toBe(900)
    expect(canvasX - a.x + a.x).toBe(canvasX - b.x + b.x)
  })

  it('appears in both slots at a zero gap', () => {
    const geometry = geometries[0]
    const strip = { lengthPx: 2000, crossPx: 200, segments: [{ text: 'x', at: 0, w: 2000 }] }
    const base = defaultScene('marquee', geometry)
    if (base.type !== 'marquee') throw new Error('wrong scene')
    const marquee: MarqueeConfig = { ...base.config, direction: 'left', gap: 0, strip }
    const [a, b] = geometry.slots
    const tau = geometry.width - 1079
    expect(visibleCopies(marquee, geometry, a, tau)).toContain(0)
    expect(visibleCopies(marquee, geometry, b, tau)).toContain(0)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/continuity.test.ts`
Expected: PASS. This is the contract that makes the wall seamless: every frame calls a state function that has no `slot` input; the renderer alone translates canvas coordinates into viewport coordinates.

- [ ] **Step 3: Commit**

```bash
git add lib/canvas/__tests__/continuity.test.ts
git commit -m "test(canvas): prove scene continuity across slots"
```

---

### Task 19: Clock service and display reporter

**Files:**
- Modify: `lib/canvas/clock.ts` (add `CanvasClock` and `SYSTEM_CLOCK`)
- Create: `lib/canvas/clock-service.ts`
- Create: `lib/canvas/reporter.ts`
- Test: `tests/canvas-clock-service.test.ts`

- [ ] **Step 1: Add the public clock shape**

Append to `lib/canvas/clock.ts`:

```ts
export type CanvasClock = {
  offsetMs: number
  uncertaintyMs: number
  quality: ClockQuality
  source: 'console' | 'system'
  sampledAt: number | null
}

export const SYSTEM_CLOCK: CanvasClock = {
  offsetMs: 0,
  uncertaintyMs: 0,
  quality: 'poor',
  source: 'system',
  sampledAt: null,
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/canvas-clock-service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { sampleFrom } from '@/lib/canvas/clock'
import { getCanvasClock, recordClockSample, resetClockSamples } from '@/lib/canvas/clock-service'
import { getDisplayReport, recordDisplayReport, resetDisplayReport } from '@/lib/canvas/reporter'

describe('clock service', () => {
  beforeEach(() => resetClockSamples())

  it('reports the system clock until a sample arrives', () => {
    expect(getCanvasClock().source).toBe('system')
    recordClockSample(sampleFrom(1_000, 1_100, 1_050))
    const clock = getCanvasClock(2_000)
    expect(clock.source).toBe('console')
    expect(clock.sampledAt).not.toBeNull()
    expect(Number.isFinite(clock.offsetMs)).toBe(true)
  })

  it('ignores null samples', () => {
    recordClockSample(null)
    expect(getCanvasClock().source).toBe('system')
  })
})

describe('display reporter', () => {
  beforeEach(() => resetDisplayReport())

  it('keeps the last report per instance', () => {
    expect(getDisplayReport('frame-a')).toBeNull()
    recordDisplayReport('frame-a', { appliedRevision: 4, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
    expect(getDisplayReport('frame-a')).toEqual({ appliedRevision: 4, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
    expect(getDisplayReport('frame-b')).toBeNull()
  })
})
```

- [ ] **Step 3: Implement `lib/canvas/clock-service.ts`**

```ts
import { estimate, SYSTEM_CLOCK, type CanvasClock, type ClockSample } from './clock'

const samples: ClockSample[] = []
const MAX_SAMPLES = 16

export function recordClockSample(sample: ClockSample | null): void {
  if (!sample) return
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
}

export function getCanvasClock(now = Date.now()): CanvasClock {
  const result = estimate(samples, now)
  if (!result) return SYSTEM_CLOCK
  return {
    offsetMs: result.offsetMs,
    uncertaintyMs: result.uncertaintyMs,
    quality: result.quality,
    source: 'console',
    sampledAt: result.sampledAt,
  }
}

export function resetClockSamples(): void {
  samples.length = 0
}
```

- [ ] **Step 4: Implement `lib/canvas/reporter.ts`**

```ts
export type DisplayReport = {
  appliedRevision: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

const reports = new Map<string, DisplayReport>()
const MAX_REPORTS = 32

export function recordDisplayReport(instanceId: string, report: DisplayReport): void {
  if (!reports.has(instanceId) && reports.size >= MAX_REPORTS) {
    const oldest = reports.keys().next().value
    if (oldest !== undefined) reports.delete(oldest)
  }
  reports.set(instanceId, { ...report })
}

export function getDisplayReport(instanceId: string): DisplayReport | null {
  return reports.get(instanceId) ?? null
}

export function resetDisplayReport(): void {
  reports.clear()
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/canvas-clock-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/clock.ts lib/canvas/clock-service.ts lib/canvas/reporter.ts tests/canvas-clock-service.test.ts
git commit -m "feat(canvas): keep the local clock estimate and display report"
```

---

### Task 20: Display-facing routes

**Files:**
- Create: `app/api/time/route.ts`
- Create: `app/api/canvas/state/route.ts`
- Create: `app/api/canvas/report/route.ts`
- Test: `tests/canvas-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/canvas-routes.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-routes'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

describe('GET /api/time', () => {
  it('returns the console time with no-store', async () => {
    const { GET } = await import('@/app/api/time/route')
    const { NextRequest } = await import('next/server')
    const before = Date.now()
    const res = await GET(new NextRequest('http://localhost/api/time'))
    const body = await res.json()
    expect(body.t).toBeGreaterThanOrEqual(before)
    expect(body.t).toBeLessThanOrEqual(Date.now())
    expect(res.headers.get('cache-control')).toContain('no-store')
  })
})

describe('GET /api/canvas/state', () => {
  beforeEach(freshDb)

  it('returns an empty state and the system clock when no row exists', async () => {
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=frame-a'))
    const body = await res.json()
    expect(body).toEqual({
      revision: 0,
      state: null,
      clock: { offsetMs: 0, uncertaintyMs: 0, quality: 'poor', source: 'system', sampledAt: null },
    })
  })

  it('reads the local row for the requested frame', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    await putCanvasState('frame-a', { v: 1, active: null, pending: null, identify: { until: 9_999, canvasName: 'Wall', frameId: 'frame-a', label: null, marker: 1, count: 1 } })
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=frame-a'))
    const body = await res.json()
    expect(body.revision).toBe(1)
    expect(body.state.identify.marker).toBe(1)
  })

  it('rejects an invalid frame id', async () => {
    const { GET } = await import('@/app/api/canvas/state/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/canvas/state?frame=bad%20frame'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/canvas/report', () => {
  beforeEach(async () => {
    await freshDb()
    const { resetDisplayReport } = await import('@/lib/canvas/reporter')
    resetDisplayReport()
  })

  it('stores a clamped report', async () => {
    const { POST } = await import('@/app/api/canvas/report/route')
    const { NextRequest } = await import('next/server')
    const { getDisplayReport } = await import('@/lib/canvas/reporter')
    const res = await POST(new NextRequest('http://localhost/api/canvas/report?frame=frame-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appliedRevision: 3, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 }),
    }))
    expect(res.status).toBe(204)
    expect(getDisplayReport('frame-a')).toEqual({ appliedRevision: 3, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
  })

  it('rejects an invalid body', async () => {
    const { POST } = await import('@/app/api/canvas/report/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/report?frame=frame-a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewportW: -1, evil: true }),
    }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-routes.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Create `app/api/time/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const limit = checkLimit(`canvas-time:${clientKey(request)}`, 600, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  return NextResponse.json({ t: Date.now() }, { headers: { 'Cache-Control': 'no-store' } })
}
```

- [ ] **Step 4: Create `app/api/canvas/state/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getCanvasClock, SYSTEM_CLOCK } from '@/lib/canvas/clock-service'
import { getCanvasState } from '@/lib/canvas/state-store'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

export async function GET(request: Request) {
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const row = await getCanvasState(remoteEntityId(frameId))
  const clock = process.env.INSTANCE_ID ? getCanvasClock() : SYSTEM_CLOCK
  return NextResponse.json(
    { revision: row?.revision ?? 0, state: row?.data ?? null, clock },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  )
}
```

- [ ] **Step 5: Create `app/api/canvas/report/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkLimit } from '@/lib/rate-limit'
import { clientKey } from '@/lib/request-ip'
import { recordDisplayReport } from '@/lib/canvas/reporter'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

const reportSchema = z.object({
  appliedRevision: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  viewportW: z.number().int().min(1).max(100_000).nullable().optional(),
  viewportH: z.number().int().min(1).max(100_000).nullable().optional(),
  fpsAvg: z.number().min(0).max(240).nullable().optional(),
})

export async function POST(request: NextRequest) {
  const frameId = frameIdParam(request.nextUrl) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const limit = checkLimit(`canvas-report:${clientKey(request)}`, 60, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'rate limited' }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = reportSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid report' }, { status: 400 })

  recordDisplayReport(remoteEntityId(frameId), {
    appliedRevision: parsed.data.appliedRevision ?? null,
    viewportW: parsed.data.viewportW ?? null,
    viewportH: parsed.data.viewportH ?? null,
    fpsAvg: parsed.data.fpsAvg ?? null,
  })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run tests/canvas-routes.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/time app/api/canvas/state app/api/canvas/report tests/canvas-routes.test.ts
git commit -m "feat(canvas): serve clock, canvas state and display reports"
```

---

### Task 21: Additive sync protocol

**Files:**
- Modify: `lib/sync/types.ts`
- Modify: `lib/sync/server.ts`
- Modify: `lib/sync/client.ts`
- Modify: `app/api/sync/pull/route.ts`
- Test: `tests/sync-canvas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/sync-canvas.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const ORIGINAL_FETCH = globalThis.fetch

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/sync-canvas'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

async function seedFrame(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const { seed } = await import('@/lib/store')
  const db = getDb() as any
  const tables = getTables() as any
  await db.insert(tables.frameDocuments).values({
    id, identifier: id, name: id, data: seed(), createdAt: new Date(), updatedAt: new Date(), revision: 1,
  })
}

const state = {
  v: 1 as const,
  active: null,
  pending: null,
  identify: { until: 9_999, canvasName: 'Wall', frameId: 'inst-1', label: null, marker: 1, count: 1 },
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('handlePull canvas delivery', () => {
  beforeEach(async () => {
    await freshDb()
    await seedFrame('inst-1')
  })

  it('includes serverTime and the canvas row when the revision differs', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { handlePull } = await import('@/lib/sync/server')
    await putCanvasState('inst-1', state)
    const before = Date.now()
    const outcome = await handlePull('inst-1', undefined, { cvRev: 0 })
    expect(outcome.serverTime).toBeGreaterThanOrEqual(before)
    expect(outcome.canvas?.revision).toBe(1)
    expect(outcome.canvas?.state?.identify?.marker).toBe(1)
  })

  it('omits canvas when the revision matches', async () => {
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { handlePull } = await import('@/lib/sync/server')
    await putCanvasState('inst-1', state)
    const outcome = await handlePull('inst-1', undefined, { cvRev: 1 })
    expect(outcome.canvas).toBeUndefined()
    expect(typeof outcome.serverTime).toBe('number')
  })

  it('sends the clearing form when the row disappeared', async () => {
    const { handlePull } = await import('@/lib/sync/server')
    const outcome = await handlePull('inst-1', undefined, { cvRev: 5 })
    expect(outcome.canvas).toEqual({ revision: 0, state: null })
  })

  it('keeps the old call shape working', async () => {
    const { handlePull } = await import('@/lib/sync/server')
    const outcome = await handlePull('inst-1')
    expect(Array.isArray(outcome.changes)).toBe(true)
    expect(typeof outcome.serverTime).toBe('number')
  })
})

describe('pullRemote canvas apply', () => {
  beforeEach(async () => {
    await freshDb()
    const { resetClockSamples } = await import('@/lib/canvas/clock-service')
    resetClockSamples()
  })

  it('stores the canvas locally, records a clock sample and never enqueues it', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      changes: [],
      cursor: '2026-01-01T00:00:00.000Z',
      resolvedConflicts: [],
      serverTime: Date.now(),
      canvas: { revision: 3, state },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch

    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console.test', token: 't', instanceId: 'inst-2' })

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('inst-2')
    expect(row?.revision).toBe(3)
    expect(row?.data.identify?.marker).toBe(1)

    const { getPending } = await import('@/lib/sync/queue')
    expect(await getPending()).toEqual([])

    const { getCanvasClock } = await import('@/lib/canvas/clock-service')
    expect(getCanvasClock().source).toBe('console')
  })

  it('sends cvRev and the last report as query parameters', async () => {
    let seen = ''
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input)
      return new Response(JSON.stringify({ changes: [], cursor: 'c', resolvedConflicts: [] }), { status: 200 })
    }) as typeof fetch

    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const { recordDisplayReport } = await import('@/lib/canvas/reporter')
    await putCanvasState('inst-2', state)
    recordDisplayReport('inst-2', { appliedRevision: 2, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })

    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console.test', token: 't', instanceId: 'inst-2' })

    expect(seen).toContain('cvRev=1')
    expect(seen).toContain('cvApplied=2')
    expect(seen).toContain('vw=1080')
    expect(seen).toContain('vh=1920')
    expect(seen).toContain('fps=29.5')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/sync-canvas.test.ts`
Expected: FAIL (`serverTime`/`canvas` missing, `cvRev` not in the URL).

- [ ] **Step 3: Extend `lib/sync/types.ts`**

Add at the top:

```ts
import type { CanvasState } from '@/lib/types'
```

Add before `PullResponse`:

```ts
export interface PullReport {
  appliedRevision: number | null
  clockOffsetMs: number | null
  clockUncertaintyMs: number | null
  viewportW: number | null
  viewportH: number | null
  fpsAvg: number | null
}

export interface PullCanvas {
  revision: number
  state: CanvasState | null
}
```

Add to `PullResponse`:

```ts
  serverTime?: number
  canvas?: PullCanvas
```

- [ ] **Step 4: Extend `lib/sync/server.ts`**

Add imports:

```ts
import { getCanvasState, recordCanvasReport, type MemberReport } from '@/lib/canvas/state-store'
```

Add to `PullOutcome`:

```ts
  serverTime: number
  canvas?: { revision: number; state: import('@/lib/types').CanvasState | null }
```

Change `handlePull` to:

```ts
export async function handlePull(
  authedInstanceId: string,
  since?: string,
  options: { cvRev?: number; report?: MemberReport } = {},
): Promise<PullOutcome> {
```

Replace the early expired return with:

```ts
        return { changes: [], cursor: new Date().toISOString(), expired: true, resolvedConflicts: [], serverTime: Date.now() }
```

Before the final `return`, insert:

```ts
  if (options.report && getDatabaseMode() === 'postgres') {
    try {
      await recordCanvasReport(authedInstanceId, options.report)
    } catch (e: unknown) {
      console.error('canvas report write failed:', e)
    }
  }

  let canvas: PullOutcome['canvas']
  try {
    const row = await getCanvasState(authedInstanceId)
    const cvRev = Math.max(0, Math.floor(options.cvRev ?? 0))
    if (row && row.revision !== cvRev) canvas = { revision: row.revision, state: row.data }
    else if (!row && cvRev > 0) canvas = { revision: 0, state: null }
  } catch (e: unknown) {
    console.error('canvas state read failed:', e)
  }

  return { changes, cursor, resolvedConflicts, serverTime: Date.now(), ...(canvas ? { canvas } : {}) }
```

The existing final return is `return { changes, cursor, resolvedConflicts }`; replace it.

- [ ] **Step 5: Extend `app/api/sync/pull/route.ts`**

Replace the query schema with:

```ts
const querySchema = z.object({
  instanceId: z.string().min(1).max(64).optional(),
  since: z.string().optional(),
  apiVersion: z.string().min(1).max(20).default(API_VERSION),
  cvRev: z.coerce.number().int().min(0).optional(),
  cvApplied: z.coerce.number().int().min(0).optional(),
  cvOff: z.coerce.number().optional(),
  cvUnc: z.coerce.number().optional(),
  vw: z.coerce.number().int().optional(),
  vh: z.coerce.number().int().optional(),
  fps: z.coerce.number().optional(),
})
```

Replace the whole handler body, from the existing `const { since, apiVersion } = parsed.data` through the final `return NextResponse.json(...)` (lines 24 to 33 of the current file), with the following. Do not leave the old compatibility block in place: `since` and `apiVersion` must be declared once.

```ts
  const { since, apiVersion, cvRev, cvApplied, cvOff, cvUnc, vw, vh, fps } = parsed.data
  if (!checkCompatibility(apiVersion, API_VERSION)) {
    return NextResponse.json({ error: 'incompatible api version' }, { status: 426 })
  }

  const hasReport = [cvApplied, cvOff, cvUnc, vw, vh, fps].some((value) => value !== undefined)
  const outcome = await handlePull(instanceId, since, {
    cvRev: cvRev ?? 0,
    report: hasReport
      ? {
          appliedRevision: cvApplied ?? null,
          clockOffsetMs: cvOff ?? null,
          clockUncertaintyMs: cvUnc ?? null,
          viewportW: vw ?? null,
          viewportH: vh ?? null,
          fpsAvg: fps ?? null,
        }
      : undefined,
  })

  const body = {
    changes: outcome.changes,
    cursor: outcome.cursor,
    resolvedConflicts: outcome.resolvedConflicts,
    serverTime: outcome.serverTime,
    ...(outcome.canvas ? { canvas: outcome.canvas } : {}),
  }
  if (outcome.expired) return NextResponse.json({ ...body, changes: [], reset: true }, { status: 410 })
  return NextResponse.json(body)
```

- [ ] **Step 6: Extend `lib/sync/client.ts`**

Replace `pullRemote` with:

```ts
export async function pullRemote(config: SyncConfig, since?: string, retried = false) {
  const { getCanvasState } = await import('@/lib/canvas/state-store')
  const { getDisplayReport } = await import('@/lib/canvas/reporter')
  const { getCanvasClock, recordClockSample } = await import('@/lib/canvas/clock-service')
  const { sampleFrom } = await import('@/lib/canvas/clock')

  const local = await getCanvasState(config.instanceId)
  const report = getDisplayReport(config.instanceId)
  const clock = getCanvasClock()

  const url = new URL(`${config.endpoint.replace(/\/$/, '')}/api/sync/pull`)
  url.searchParams.set('instanceId', config.instanceId)
  if (since) url.searchParams.set('since', since)
  url.searchParams.set('apiVersion', API_VERSION)
  url.searchParams.set('cvRev', String(local?.revision ?? 0))
  if (report?.appliedRevision !== null && report?.appliedRevision !== undefined) url.searchParams.set('cvApplied', String(report.appliedRevision))
  if (report?.viewportW !== null && report?.viewportW !== undefined) url.searchParams.set('vw', String(report.viewportW))
  if (report?.viewportH !== null && report?.viewportH !== undefined) url.searchParams.set('vh', String(report.viewportH))
  if (report?.fpsAvg !== null && report?.fpsAvg !== undefined) url.searchParams.set('fps', String(report.fpsAvg))
  if (clock.source === 'console') {
    url.searchParams.set('cvOff', String(clock.offsetMs))
    url.searchParams.set('cvUnc', String(clock.uncertaintyMs))
  }

  const t0 = Date.now()
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${config.token}` } })
  const t1 = Date.now()
  if (res.status === 410 && !retried) {
    return pullRemote(config, undefined, true)
  }
  if (!res.ok) throw new Error(`pull failed: ${res.status}`)
  const data = await res.json()

  if (typeof data.serverTime === 'number') {
    const sample = sampleFrom(t0, t1, data.serverTime)
    recordClockSample(sample)
  }
  if (data.canvas && typeof data.canvas.revision === 'number') {
    const { applyRemoteCanvasState } = await import('@/lib/canvas/state-store')
    await applyRemoteCanvasState(config.instanceId, data.canvas.revision, data.canvas.state ?? null)
  }

  const { mutateStore } = await import('@/lib/store')
  for (const c of data.changes ?? []) {
    if (c.entityType === 'frame_document' && c.operation === 'upsert') {
      await mutateStore(() => c.payload as import('@/lib/types').FrameStore, localFrameId(c.entityId), { source: 'remote', revision: c.revision })
    }
  }
  for (const rc of data.resolvedConflicts ?? []) {
    const { discardConflictsFor } = await import('./queue')
    await discardConflictsFor(rc.entityId)
  }
  return data.cursor as string
}
```

The dynamic import path for the reporter is `@/lib/canvas/reporter`, as written.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run tests/sync-canvas.test.ts tests/canvas-state-store.test.ts && npx tsc --noEmit`
Expected: PASS. If `serverTime` in the response is missing on the expired path, check the replaced early return.

- [ ] **Step 8: Commit**

```bash
git add lib/sync/types.ts lib/sync/server.ts lib/sync/client.ts app/api/sync/pull/route.ts tests/sync-canvas.test.ts
git commit -m "feat(canvas): deliver canvas state and server time over pull"
```

---

### Task 22: Canvas poll with active and idle delays

**Files:**
- Create: `lib/canvas/poll.ts`
- Modify: `lib/lifecycle/index.ts`
- Test: `lib/canvas/__tests__/poll.test.ts`

The 15 minute sync worker is too slow for canvas delivery. A second timer runs `runSyncCycle(config)` so the existing checkpoint, clock sampling and report path all run unchanged. A local canvas state row with a deployment or identify makes the instance active (5 s); otherwise it is idle (30 s). Both delays get plus or minus 10 percent jitter. A failed cycle backs off to 30 s, then 60 s. Each next tick is a fresh `setTimeout`, so the active and idle delays are re-evaluated every cycle.

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/poll.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollDelayMs, startCanvasPoll, stopCanvasPoll, type CanvasPollEnv } from '@/lib/canvas/poll'
import type { SyncConfig } from '@/lib/sync/client'

const config: SyncConfig = { endpoint: 'http://console.test', token: 't', instanceId: 'i1' }
const env: CanvasPollEnv = {}
const steady = () => 0.5

afterEach(() => {
  stopCanvasPoll()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pollDelayMs', () => {
  it('uses 5 s active and 30 s idle with ±10% jitter', () => {
    expect(pollDelayMs(true, env, () => 0)).toBe(4500)
    expect(pollDelayMs(true, env, steady)).toBe(5000)
    expect(pollDelayMs(true, env, () => 1)).toBe(5500)
    expect(pollDelayMs(false, env, steady)).toBe(30_000)
  })

  it('honours env overrides and falls back to the sync interval for zero', () => {
    expect(pollDelayMs(true, { CANVAS_POLL_ACTIVE_SECONDS: '8' }, steady)).toBe(8000)
    expect(pollDelayMs(false, { CANVAS_POLL_IDLE_SECONDS: '10' }, steady)).toBe(10_000)
    expect(pollDelayMs(true, { CANVAS_POLL_ACTIVE_SECONDS: '0', SYNC_INTERVAL_MINUTES: '15' }, steady)).toBe(900_000)
    expect(pollDelayMs(false, { CANVAS_POLL_IDLE_SECONDS: '0' }, steady)).toBe(900_000)
  })
})

describe('startCanvasPoll', () => {
  it('runs immediately, re-evaluates the state and stops cleanly', async () => {
    vi.useFakeTimers()
    let calls = 0
    let active = true
    startCanvasPoll(config, {
      env,
      random: steady,
      isActive: () => active,
      run: async () => { calls++ },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(calls).toBe(2)
    active = false
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toBe(3)
    stopCanvasPoll()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toBe(3)
  })

  it('backs off to 30 s then 60 s and ignores a second start', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let calls = 0
    const run = async () => {
      calls++
      throw new Error('console down')
    }
    startCanvasPoll(config, { env, random: steady, isActive: () => true, run })
    startCanvasPoll(config, { env, random: steady, isActive: () => false, run })
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toBe(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toBe(3)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/poll.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `lib/canvas/poll.ts`**

```ts
import { runSyncCycle, type SyncConfig } from '@/lib/sync/client'
import { getCanvasState } from './state-store'

export type CanvasPollEnv = {
  CANVAS_POLL_ACTIVE_SECONDS?: string
  CANVAS_POLL_IDLE_SECONDS?: string
  SYNC_INTERVAL_MINUTES?: string
}

export type CanvasPollOptions = {
  env?: CanvasPollEnv
  random?: () => number
  isActive?: () => boolean | Promise<boolean>
  run?: (config: SyncConfig) => Promise<unknown>
}

const ACTIVE_MS = 5000
const IDLE_MS = 30_000
const BACKOFF_MS = [30_000, 60_000] as const
const JITTER = 0.1

function overrideSeconds(env: CanvasPollEnv, key: 'CANVAS_POLL_ACTIVE_SECONDS' | 'CANVAS_POLL_IDLE_SECONDS'): number | null {
  const raw = env[key]
  if (raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function regularSyncMs(env: CanvasPollEnv): number {
  const raw = env.SYNC_INTERVAL_MINUTES
  const minutes = raw === undefined || raw === '' ? 15 : Number(raw)
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000
}

function withJitter(ms: number, random: () => number): number {
  const factor = 1 + (random() * 2 - 1) * JITTER
  return Math.max(1, Math.round(ms * factor))
}

/** Pure delay calculation; `random` is injected so the jitter is testable. */
export function pollDelayMs(
  active: boolean,
  env: CanvasPollEnv = process.env,
  random: () => number = Math.random,
): number {
  const key = active ? 'CANVAS_POLL_ACTIVE_SECONDS' : 'CANVAS_POLL_IDLE_SECONDS'
  const override = overrideSeconds(env, key)
  if (override === 0) return withJitter(regularSyncMs(env), random)
  if (override !== null) return withJitter(override * 1000, random)
  return withJitter(active ? ACTIVE_MS : IDLE_MS, random)
}

function backoffMs(failures: number, random: () => number): number {
  return withJitter(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1], random)
}

async function stateIsActive(instanceId: string): Promise<boolean> {
  try {
    const row = await getCanvasState(instanceId)
    return Boolean(row?.data?.active || row?.data?.identify)
  } catch {
    return false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
let generation = 0
let failures = 0

export function startCanvasPoll(config: SyncConfig, options: CanvasPollOptions = {}): void {
  if (timer !== null) return
  const env = options.env ?? process.env
  const random = options.random ?? Math.random
  const isActive = options.isActive ?? (() => stateIsActive(config.instanceId))
  const run = options.run ?? runSyncCycle
  const token = generation

  const tick = async () => {
    if (token !== generation) return
    timer = null
    let failed = false
    try {
      await run(config)
    } catch (error: unknown) {
      failed = true
      console.error('canvas poll failed:', error)
    }
    if (token !== generation) return
    failures = failed ? failures + 1 : 0
    const active = await isActive()
    if (token !== generation) return
    const delay = failed ? backoffMs(failures, random) : pollDelayMs(active, env, random)
    timer = setTimeout(tick, delay)
  }

  timer = setTimeout(tick, 0)
}

export function stopCanvasPoll(): void {
  generation += 1
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  failures = 0
}
```

- [ ] **Step 4: Start and stop it in `lib/lifecycle/index.ts`**

Inside `initInstance`, after `startSyncWorker(...)` in the same `if` block, add:

```ts
      const { startCanvasPoll } = await import('@/lib/canvas/poll')
      startCanvasPoll({ endpoint: process.env.SYNC_ENDPOINT, token: process.env.SYNC_TOKEN, instanceId: process.env.INSTANCE_ID })
```

Put it in the existing `try` so a failed import does not stop the sync worker. The delays come from `CANVAS_POLL_ACTIVE_SECONDS`, `CANVAS_POLL_IDLE_SECONDS` and `SYNC_INTERVAL_MINUTES` through `process.env`; there is no `CANVAS_POLL_MS` any more. In `shutdownInstance`, before `stopSyncWorker()`, add:

```ts
    const { stopCanvasPoll } = await import('@/lib/canvas/poll')
    stopCanvasPoll()
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/poll.test.ts tests/lifecycle.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/canvas/poll.ts lib/lifecycle/index.ts lib/canvas/__tests__/poll.test.ts
git commit -m "feat(canvas): poll on active and idle delays with backoff"
```

---

### Task 23: Render model and axis projection

**Files:**
- Create: `lib/canvas/render-model.ts`
- Create: `lib/canvas/project.ts`
- Test: `lib/canvas/__tests__/render-model.test.ts`
- Test: `lib/canvas/__tests__/project.test.ts`

`render-model` turns a synced instant into the one thing a display draws: the takeover, the scheduled scene, its resolved state and the identify overlay. It is pure, so the React layer can call it every frame. `project` maps the pong scene's along/cross coordinates onto canvas x/y for either axis.

- [ ] **Step 1: Write the failing render-model test**

Create `lib/canvas/__tests__/render-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasState } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { defaultScene } from '@/lib/canvas/scenes/registry'
import { canvasRenderModel } from '@/lib/canvas/render-model'

const config: CanvasConfig = {
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
}
const geometry = resolveGeometry(config)
const marquee = defaultScene('marquee', geometry)

function deployment(overrides: Partial<CanvasDeployment> = {}): CanvasDeployment {
  return {
    canvasId: 'wall',
    name: 'Wall',
    revision: 4,
    effectiveAt: 10_000,
    releaseAt: null,
    slotId: 'a',
    config,
    album: { id: 'album-1', name: 'Album', scenes: [marquee], order: 'sequence', crossfadeMs: 0 },
    ...overrides,
  }
}

function state(overrides: Partial<CanvasState> = {}): CanvasState {
  return { v: 1, active: deployment(), pending: null, identify: null, ...overrides }
}

describe('canvasRenderModel', () => {
  it('resolves the scene and its state at a synced instant', () => {
    const model = canvasRenderModel(state(), 10_500)!
    expect(model.takeover?.slot.slotId).toBe('a')
    expect(model.plan?.scene.id).toBe(marquee.id)
    expect(model.plan?.sceneTimeMs).toBe(500)
    expect(model.plan?.seed).toBe(marquee.seed)
    expect(model.render?.type).toBe('marquee')
    expect(model.identify).toBeNull()
  })

  it('returns a pre-roll model before the first scene and applies the clock offset', () => {
    const preRoll = canvasRenderModel(state(), 9_000)!
    expect(preRoll.takeover?.slot.slotId).toBe('a')
    expect(preRoll.plan).toBeNull()
    expect(preRoll.render).toBeNull()
    expect(canvasRenderModel(state(), 9_000, 1_500)?.plan?.sceneTimeMs).toBe(500)
  })

  it('shows identify only until its deadline', () => {
    const identify = { until: 12_000, canvasName: 'Wall', frameId: 'fa', label: 'Left', marker: 1, count: 2 }
    expect(canvasRenderModel(state({ identify }), 11_000)?.identify?.marker).toBe(1)
    expect(canvasRenderModel(state({ identify }), 12_000)?.identify).toBeNull()
  })

  it('returns identify without a takeover', () => {
    const identify = { until: 12_000, canvasName: 'Wall', frameId: 'fa', label: 'Left', marker: 1, count: 2 }
    const model = canvasRenderModel(state({ active: null, identify }), 11_000)!
    expect(model.takeover).toBeNull()
    expect(model.plan).toBeNull()
    expect(model.render).toBeNull()
    expect(model.slotRect).toBeNull()
    expect(model.identify?.marker).toBe(1)
  })

  it('returns the takeover without a scene when the album is empty', () => {
    const model = canvasRenderModel(state({ active: deployment({ album: null }) }), 11_000)!
    expect(model.takeover?.deployment.canvasId).toBe('wall')
    expect(model.plan).toBeNull()
    expect(model.render).toBeNull()
  })

  it('is null when the deployment has been released', () => {
    expect(canvasRenderModel(state({ active: deployment({ releaseAt: 11_000 }) }), 11_000)).toBeNull()
    expect(canvasRenderModel(null, 11_000)).toBeNull()
  })

  it('is deterministic', () => {
    expect(canvasRenderModel(state(), 12_345)).toEqual(canvasRenderModel(state(), 12_345))
  })
})
```

- [ ] **Step 2: Write the failing projection test**

Create `lib/canvas/__tests__/project.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pongBallRect, pongPaddleRect, projectRect } from '@/lib/canvas/project'

describe('projectRect', () => {
  it('keeps along/cross on x/y for horizontal', () => {
    expect(projectRect('horizontal', 10, 20, 30, 40)).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('swaps along/cross for vertical', () => {
    expect(projectRect('vertical', 10, 20, 30, 40)).toEqual({ x: 20, y: 10, w: 40, h: 30 })
  })
})

describe('pong rectangles', () => {
  const paddle = { w: 24, h: 220, inset: 40 }
  const bounds = { width: 1080, height: 1920 }

  it('puts side 0 at the inset and side 1 at the far inset', () => {
    expect(pongPaddleRect('horizontal', 0, paddle, 300, bounds)).toEqual({ x: 40, y: 300, w: 24, h: 220 })
    expect(pongPaddleRect('horizontal', 1, paddle, 300, bounds)).toEqual({ x: 1080 - 64, y: 300, w: 24, h: 220 })
  })

  it('turns paddles across the canvas for a vertical court', () => {
    expect(pongPaddleRect('vertical', 0, paddle, 100, bounds)).toEqual({ x: 100, y: 40, w: 220, h: 24 })
    expect(pongPaddleRect('vertical', 1, paddle, 100, bounds)).toEqual({ x: 100, y: 1920 - 64, w: 220, h: 24 })
  })

  it('centres the ball on its position', () => {
    expect(pongBallRect('horizontal', { x: 500, y: 300 }, 28)).toEqual({ x: 486, y: 286, w: 28, h: 28 })
    expect(pongBallRect('vertical', { x: 500, y: 300 }, 28)).toEqual({ x: 286, y: 486, w: 28, h: 28 })
  })
})
```

- [ ] **Step 3: Run them**

Run: `pnpm vitest run lib/canvas/__tests__/render-model.test.ts lib/canvas/__tests__/project.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `lib/canvas/project.ts`**

```ts
import type { PongConfig } from '@/lib/types'

export type Rect = { x: number; y: number; w: number; h: number }
export type PongAxis = 'horizontal' | 'vertical'

/** Map a court coordinate (along the play axis, across it) onto canvas x/y. */
export function projectRect(axis: PongAxis, along: number, cross: number, alongSize: number, crossSize: number): Rect {
  return axis === 'horizontal'
    ? { x: along, y: cross, w: alongSize, h: crossSize }
    : { x: cross, y: along, w: crossSize, h: alongSize }
}

export function pongPaddleRect(
  axis: PongAxis,
  side: 0 | 1,
  paddle: PongConfig['paddle'],
  crossTop: number,
  bounds: { width: number; height: number },
): Rect {
  const along = axis === 'horizontal' ? bounds.width : bounds.height
  const start = side === 0 ? paddle.inset : along - paddle.inset - paddle.w
  return projectRect(axis, start, crossTop, paddle.w, paddle.h)
}

export function pongBallRect(axis: PongAxis, ball: { x: number; y: number }, size: number): Rect {
  return projectRect(axis, ball.x - size / 2, ball.y - size / 2, size, size)
}

export function pongNetRect(axis: PongAxis, bounds: { width: number; height: number }, thickness = 2): Rect {
  const along = axis === 'horizontal' ? bounds.width : bounds.height
  const cross = axis === 'horizontal' ? bounds.height : bounds.width
  return projectRect(axis, along / 2 - thickness / 2, 0, thickness, cross)
}
```

- [ ] **Step 5: Implement `lib/canvas/render-model.ts`**

```ts
import type { CanvasIdentify, CanvasState } from '@/lib/types'
import { resolveCanvasTakeover, type CanvasTakeover } from './takeover'
import { sceneAt, type ScenePlan } from './scheduler'
import { computeSceneState, type SceneRenderState } from './scenes/registry'
import { seedFromString } from './prng'

export type CanvasRenderModel = {
  takeover: CanvasTakeover | null
  plan: ScenePlan | null
  render: SceneRenderState | null
  identify: CanvasIdentify | null
  slotRect: string | null
}

/**
 * Everything one display needs for one instant. `nowMs` is local time;
 * `clockOffsetMs` converts it to console time, which is the time the
 * deployment and identify deadlines are written in. Identify is independent
 * of a deployment, so a live identify yields a model with no takeover or scene.
 * Before `effectiveAt` the model is pre-roll: background and marker only.
 */
export function canvasRenderModel(
  state: CanvasState | null,
  nowMs: number,
  clockOffsetMs = 0,
): CanvasRenderModel | null {
  if (!state) return null
  const synced = nowMs + clockOffsetMs
  const identify = state.identify && state.identify.until > synced ? state.identify : null
  const takeover = resolveCanvasTakeover(state, synced)
  if (!takeover && !identify) return null

  let plan: ScenePlan | null = null
  let render: SceneRenderState | null = null
  let slotRect: string | null = null

  if (takeover) {
    const { deployment, geometry, slot } = takeover
    slotRect = `${slot.w}×${slot.h} cpx @ ${slot.x},${slot.y}`
    const t = synced - deployment.effectiveAt
    const album = deployment.album
    if (album && t >= 0) {
      plan = sceneAt(album, seedFromString(album.id), t, album.crossfadeMs)
      render = plan
        ? computeSceneState(plan.scene, {
            bounds: { width: geometry.width, height: geometry.height },
            geometry,
            tMs: plan.sceneTimeMs,
            seed: plan.seed,
          })
        : null
    }
  }

  return { takeover, plan, render, identify, slotRect }
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/render-model.test.ts lib/canvas/__tests__/project.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/canvas/render-model.ts lib/canvas/project.ts lib/canvas/__tests__/render-model.test.ts lib/canvas/__tests__/project.test.ts
git commit -m "feat(canvas): resolve the render model and project court axes"
```

---

### Task 24: Canvas frame scene rendering

**Files:**
- Create: `components/frame/canvas/canvas-frame-scene.tsx`
- Test: `tests/canvas-scene.test.ts`

Scene state is canvas-wide. Each display clips it to its own slot, so this component draws in canvas coordinates and the stage translates and scales. The React tree is built only when the scene or its config changes; the stage's animation loop mutates the registered elements imperatively through `paintScene`. No `setState` happens in that loop.

- [ ] **Step 1: Write the wiring test**

Create `tests/canvas-scene.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const scene = readFileSync(path.join(root, 'components/frame/canvas/canvas-frame-scene.tsx'), 'utf8')

describe('canvas scene rendering', () => {
  it('has a renderer for every scene type', () => {
    for (const name of ['MarqueeView', 'BounceView', 'PongView', 'SyncTestView', 'CanvasFrameScene']) {
      expect(scene).toContain(`function ${name}`)
    }
  })

  it('clips marquee copies to the slot with the shared helpers', () => {
    expect(scene).toContain('visibleCopies(config, geometry, slot, state.tauPx)')
    expect(scene).toContain('copyPosition(config, geometry, state.tauPx, copy)')
    expect(scene).toContain('visibleSegments(')
  })

  it('projects pong court coordinates for either axis', () => {
    expect(scene).toContain('pongPaddleRect(')
    expect(scene).toContain('pongBallRect(')
    expect(scene).toContain('pongNetRect(')
  })

  it('paints the bounce trail and corner only when enabled and motion is allowed', () => {
    expect(scene).toContain('state.trail.length > 0')
    expect(scene).toContain('config.cornerCelebration')
    expect(scene).toContain("prefers-reduced-motion: reduce")
    expect(scene).toContain('export function paintScene')
  })

  it('draws the sync-test helpers', () => {
    expect(scene).toContain('config.showGrid')
    expect(scene).toContain('config.showBezels')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-scene.test.ts`
Expected: FAIL (file not found).

- [ ] **Step 3: Create `components/frame/canvas/canvas-frame-scene.tsx`**

```tsx
import type { CSSProperties, ReactNode } from 'react'
import type { Align, BounceConfig, MarqueeConfig, PongConfig, SyncTestConfig } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { SceneRenderState } from '@/lib/canvas/scenes/registry'
import type { BounceState } from '@/lib/canvas/scenes/bounce'
import type { MarqueeState } from '@/lib/canvas/scenes/marquee'
import type { PongState } from '@/lib/canvas/scenes/pong'
import type { SyncTestState } from '@/lib/canvas/scenes/sync-test'
import { copyPosition, visibleCopies, visibleSegments } from '@/lib/canvas/scenes/marquee'
import { pongBallRect, pongNetRect, pongPaddleRect, projectRect, type Rect } from '@/lib/canvas/project'
import { fontStack } from '@/lib/fonts'
import { textEffectCss } from '@/lib/text-effects'

export type CanvasElementRefs = Map<string, HTMLElement | null>

const MARQUEE_POOL = 4
const TRAIL_POOL = 12

type ViewProps<TConfig, TState> = {
  config: TConfig
  state: TState
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refs: CanvasElementRefs
}

const JUSTIFY: Record<Align, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
}

function ref(key: string, refs: CanvasElementRefs) {
  return (element: HTMLElement | null) => { refs.set(key, element) }
}

function textStyle(style: MarqueeConfig['style'], color = style.color): CSSProperties {
  return {
    fontFamily: fontStack(style.fontFamily),
    fontWeight: style.fontWeight,
    letterSpacing: `${style.letterSpacing / 100}em`,
    color,
    opacity: style.opacity / 100,
    ...textEffectCss(style),
  }
}

function box(rect: Rect, extra: CSSProperties = {}): CSSProperties {
  return { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, ...extra }
}

function placed(el: HTMLElement | null, rect: Rect): void {
  if (!el) return
  el.style.left = `${rect.x}px`
  el.style.top = `${rect.y}px`
  el.style.width = `${rect.w}px`
  el.style.height = `${rect.h}px`
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function MarqueeView({ config, state, refs }: ViewProps<MarqueeConfig, MarqueeState>) {
  const rotate = state.axis === 'y' && state.orientation === 'upright' ? (state.direction === 'up' ? -90 : 90) : 0
  const text = textStyle(state.style)
  const height = state.layout === 'block' ? state.lineHeight : state.crossPx

  return (
    <div className="absolute inset-0 overflow-hidden">
      {Array.from({ length: MARQUEE_POOL }, (_, j) =>
        state.strip.segments.map((segment, index) => (
          <div
            key={`${j}:${index}`}
            ref={ref(`marquee:${j}:${index}`, refs)}
            style={box({ x: 0, y: 0, w: segment.w, h: height }, {
              display: 'none',
              alignItems: 'center',
              justifyContent: JUSTIFY[config.align],
              overflow: 'hidden',
            })}
          >
            <span
              style={{
                ...text,
                fontSize: state.fontSize,
                lineHeight: state.layout === 'block' ? `${state.lineHeight}px` : undefined,
                whiteSpace: 'pre',
                display: 'inline-block',
                transform: rotate ? `rotate(${rotate}deg)` : undefined,
                writingMode: state.axis === 'y' && state.orientation === 'rotated' ? 'vertical-rl' : undefined,
              }}
            >
              {segment.text}
            </span>
          </div>
        )),
      )}
    </div>
  )
}

function logoShape(shape: 'none' | 'ellipse' | 'pill' | 'rounded'): CSSProperties {
  if (shape === 'ellipse') return { borderRadius: '50%', border: '4px solid currentColor' }
  if (shape === 'pill') return { borderRadius: 9999, border: '4px solid currentColor' }
  if (shape === 'rounded') return { borderRadius: 24, border: '4px solid currentColor' }
  return {}
}

function BounceView({ config, state, refs }: ViewProps<BounceConfig, BounceState>) {
  const color = state.color ?? (config.logo.kind === 'text' ? config.logo.style.color : '#ffffff')
  return (
    <>
      {Array.from({ length: TRAIL_POOL }, (_, index) => (
        <div
          key={index}
          ref={ref(`bounce:trail:${index}`, refs)}
          style={box({ x: 0, y: 0, w: state.w, h: state.h }, {
            display: 'none',
            borderRadius: config.logo.kind === 'text' ? 9999 : 12,
            background: color,
          })}
        />
      ))}
      <div
        ref={ref('bounce:logo', refs)}
        style={box({ x: 0, y: 0, w: state.w, h: state.h }, {
          display: 'flex', alignItems: 'center', justifyContent: 'center', color,
        })}
      >
        {config.logo.kind === 'text' ? (
          <div
            style={{
              ...textStyle(config.logo.style, color),
              ...logoShape(config.logo.shape),
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: Math.min(config.logo.h * 0.6, (config.logo.w / Math.max(1, config.logo.text.length)) * 1.6),
              textAlign: 'center',
            }}
          >
            {config.logo.text}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logo.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
      <div
        ref={ref('bounce:corner', refs)}
        style={box({ x: 0, y: 0, w: state.w + 32, h: state.h + 32 }, {
          display: 'none', borderRadius: 24, border: `6px solid ${color}`, boxShadow: `0 0 48px ${color}`,
        })}
      />
    </>
  )
}

function scoreBox(axis: 'horizontal' | 'vertical'): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: axis === 'horizontal' ? 'row' : 'column',
    justifyContent: 'space-between',
    padding: axis === 'horizontal' ? '32px 56px' : '56px 32px',
    pointerEvents: 'none',
  }
}

function PongView({ config, state, geometry, refs }: ViewProps<PongConfig, PongState>) {
  const axis = state.axis
  const score = textStyle(config.scoreStyle, config.colors.text)
  const scoreFont = Math.min(geometry.width, geometry.height) * 0.09

  return (
    <>
      <div
        ref={ref('pong:net', refs)}
        style={box(pongNetRect(axis, geometry), {
          opacity: 0.55,
          backgroundImage:
            axis === 'horizontal'
              ? `repeating-linear-gradient(to bottom, ${config.colors.net} 0 14px, transparent 14px 28px)`
              : `repeating-linear-gradient(to right, ${config.colors.net} 0 14px, transparent 14px 28px)`,
        })}
      />
      {config.showScore && (
        <div style={scoreBox(axis)}>
          <span ref={ref('pong:score:0', refs)} style={{ ...score, fontSize: scoreFont }}>{state.score[0]}</span>
          <span ref={ref('pong:score:1', refs)} style={{ ...score, fontSize: scoreFont }}>{state.score[1]}</span>
        </div>
      )}
      <div ref={ref('pong:paddle:0', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: config.colors.paddles, borderRadius: config.paddle.w / 2 })} />
      <div ref={ref('pong:paddle:1', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: config.colors.paddles, borderRadius: config.paddle.w / 2 })} />
      <div ref={ref('pong:ball', refs)} style={box({ x: 0, y: 0, w: config.ballSize, h: config.ballSize }, { display: 'none', background: config.colors.ball, borderRadius: '50%' })} />
      <div
        ref={ref('pong:banner', refs)}
        className="absolute inset-0 flex items-center justify-center"
        style={{
          display: 'none',
          ...score,
          color: config.colors.text,
          fontSize: Math.min(geometry.width, geometry.height) * 0.07,
          letterSpacing: '0.12em',
        }}
      />
    </>
  )
}

function SyncTestView({ config, geometry, refs }: ViewProps<SyncTestConfig, SyncTestState>) {
  return (
    <>
      {config.showGrid && (
        <div className="absolute inset-0">
          {Array.from({ length: Math.floor(geometry.width / 120) + 1 }, (_, index) => (
            <div
              key={`v${index}`}
              style={{ position: 'absolute', left: index * 120, top: 0, width: 1, height: geometry.height, background: 'rgba(255,255,255,0.16)' }}
            />
          ))}
          {Array.from({ length: Math.floor(geometry.height / 120) + 1 }, (_, index) => (
            <div
              key={`h${index}`}
              style={{ position: 'absolute', left: 0, top: index * 120, width: geometry.width, height: 1, background: 'rgba(255,255,255,0.16)' }}
            />
          ))}
        </div>
      )}
      {config.showBezels &&
        geometry.gaps.map((gap, index) => (
          <div
            key={`gap${index}`}
            style={box(gap, { border: '2px solid rgba(255,180,0,0.65)', background: 'rgba(255,180,0,0.08)' })}
          />
        ))}
      {geometry.slots.map((entry) => (
        <div
          key={entry.slotId}
          style={{
            position: 'absolute',
            left: entry.x,
            top: entry.y,
            width: entry.w,
            height: entry.h,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(120,200,255,0.45)',
            color: '#dbeafe',
            fontFamily: fontStack('mono'),
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {entry.marker} · {entry.slotId}
        </div>
      ))}
      <div ref={ref('sync:bar', refs)} style={box({ x: 0, y: 0, w: 0, h: 0 }, { background: '#ffffff', boxShadow: '0 0 32px rgba(255,255,255,0.9)' })} />
    </>
  )
}

export function CanvasFrameScene({
  model,
  geometry,
  slot,
  refs,
}: {
  model: SceneRenderState
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refs: CanvasElementRefs
}): ReactNode {
  switch (model.type) {
    case 'marquee':
      return <MarqueeView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'bounce':
      return <BounceView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'pong':
      return <PongView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
    case 'sync-test':
      return <SyncTestView config={model.config} state={model.state} geometry={geometry} slot={slot} refs={refs} />
  }
}

/**
 * Called once per rendered frame by CanvasStage. Only element styles change;
 * no React state is touched here.
 */
export function paintScene(
  model: SceneRenderState,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
  refs: CanvasElementRefs,
): void {
  if (model.type === 'marquee') {
    const { config, state } = model
    const axisStart = state.axis === 'x' ? slot.x : slot.y
    const axisEnd = axisStart + (state.axis === 'x' ? slot.w : slot.h)
    const copies = visibleCopies(config, geometry, slot, state.tauPx)
    const height = state.layout === 'block' ? state.lineHeight : state.crossPx
    for (let j = 0; j < MARQUEE_POOL; j++) {
      for (let i = 0; i < state.strip.segments.length; i++) {
        const el = refs.get(`marquee:${j}:${i}`)
        if (!el) continue
        const copy = copies[j]
        if (copy === undefined) {
          el.style.display = 'none'
          continue
        }
        const origin = copyPosition(config, geometry, state.tauPx, copy)
        const segment = state.strip.segments[i]
        const shown = visibleSegments(state.strip, origin, axisStart, axisEnd).includes(segment)
        el.style.display = shown ? 'flex' : 'none'
        if (shown) {
          placed(el, projectRect(
            state.axis === 'x' ? 'horizontal' : 'vertical',
            origin + segment.at,
            state.crossStart,
            segment.w,
            height,
          ))
        }
      }
    }
    return
  }

  if (model.type === 'bounce') {
    const { config, state } = model
    const color = state.color ?? (config.logo.kind === 'text' ? config.logo.style.color : '#ffffff')
    const allowDecorative = !reducedMotion()
    const logo = refs.get('bounce:logo')
    if (logo) {
      logo.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`
      logo.style.color = color
    }
    for (let i = 0; i < TRAIL_POOL; i++) {
      const el = refs.get(`bounce:trail:${i}`)
      if (!el) continue
      const point = state.trail[i]
      const show = allowDecorative && config.trail.enabled && state.trail.length > 0 && Boolean(point)
      el.style.display = show ? 'block' : 'none'
      if (show && point) {
        el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
        el.style.opacity = String(Math.max(0.04, 0.18 - i * 0.03))
        el.style.background = color
      }
    }
    const corner = refs.get('bounce:corner')
    if (corner) {
      const show = allowDecorative && config.cornerCelebration && state.cornerAgeMs !== null && state.cornerAgeMs < 1200
      corner.style.display = show ? 'block' : 'none'
      if (show && state.cornerAgeMs !== null) {
        corner.style.transform = `translate3d(${state.x - 16}px, ${state.y - 16}px, 0)`
        corner.style.opacity = String(1 - state.cornerAgeMs / 1200)
      }
    }
    return
  }

  if (model.type === 'pong') {
    const { config, state } = model
    const axis = state.axis
    placed(refs.get('pong:net') ?? null, pongNetRect(axis, geometry))
    placed(refs.get('pong:paddle:0') ?? null, pongPaddleRect(axis, 0, config.paddle, state.paddles[0], geometry))
    placed(refs.get('pong:paddle:1') ?? null, pongPaddleRect(axis, 1, config.paddle, state.paddles[1], geometry))
    const ball = refs.get('pong:ball')
    if (ball) {
      ball.style.display = state.ball.visible ? 'block' : 'none'
      if (state.ball.visible) placed(ball, pongBallRect(axis, state.ball, config.ballSize))
    }
    for (const side of [0, 1] as const) {
      const score = refs.get(`pong:score:${side}`)
      if (score) score.textContent = String(state.score[side])
    }
    const banner = refs.get('pong:banner')
    if (banner) {
      banner.style.display = state.banner ? 'flex' : 'none'
      if (state.banner) banner.textContent = state.banner
    }
    return
  }

  const bar: Rect =
    model.state.axis === 'x'
      ? { x: model.state.bar - 3, y: 0, w: 6, h: geometry.height }
      : { x: 0, y: model.state.bar - 3, w: geometry.width, h: 6 }
  placed(refs.get('sync:bar') ?? null, bar)
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `pnpm vitest run tests/canvas-scene.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/frame/canvas/canvas-frame-scene.tsx tests/canvas-scene.test.ts
git commit -m "feat(canvas): render all four scene types imperatively"
```

---

### Task 25: Canvas stage and display takeover

**Files:**
- Create: `lib/canvas/stage.ts`
- Create: `components/frame/canvas/canvas-stage.tsx`
- Create: `components/frame/canvas/identify-overlay.tsx`
- Modify: `components/frame/frame-display.tsx`
- Test: `lib/canvas/__tests__/stage.test.ts`
- Test: `tests/canvas-display.test.ts`

The stage clips the canvas to this display's slot, scales it to the viewport, and layers identify markers, night mode and notifications on top. The animation loop lives in the stage and paints through refs; `FrameDisplay` only renders when the model changes and reports what the stage drew. Identify works without a deployment.

- [ ] **Step 1: Write the failing scale test**

Create `lib/canvas/__tests__/stage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitScale } from '@/lib/canvas/stage'

describe('fitScale', () => {
  it('fits a slot inside the viewport without cropping', () => {
    expect(fitScale(1080, 1920, 1080, 1920)).toBe(1)
    expect(fitScale(1080, 1920, 1920, 1080)).toBe(0.5625)
    expect(fitScale(540, 960, 1080, 1920)).toBe(2)
  })

  it('returns zero before the viewport is known', () => {
    expect(fitScale(1080, 1920, 0, 0)).toBe(0)
    expect(fitScale(0, 1920, 1080, 1920)).toBe(0)
  })
})
```

- [ ] **Step 2: Write the failing wiring test**

Create `tests/canvas-display.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const display = readFileSync(path.join(root, 'components/frame/frame-display.tsx'), 'utf8')
const stage = readFileSync(path.join(root, 'components/frame/canvas/canvas-stage.tsx'), 'utf8')
const overlay = readFileSync(path.join(root, 'components/frame/canvas/identify-overlay.tsx'), 'utf8')

describe('frame display canvas takeover', () => {
  it('polls canvas state and swaps in the stage', () => {
    expect(display).toContain('/api/canvas/state?frame=')
    expect(display).toContain('canvasRenderModel(')
    expect(display).toContain('<CanvasStage')
    expect(display).not.toContain('setFrameTick')
  })

  it('reports the applied revision, viewport and measured fps', () => {
    expect(display).toContain('/api/canvas/report?frame=')
    expect(display).toContain('appliedRevision: canvasModel ? revision : null')
    expect(display).toContain('fpsAvg: fpsRef.current')
  })

  it('owns the animation loop in the stage and paints through refs', () => {
    expect(stage).toContain('requestAnimationFrame(')
    expect(stage).toContain('paintScene(')
    expect(stage).toContain('sceneAt(')
    expect(stage).toContain('onFps?.(')
    expect(stage).not.toContain('setFrameTick')
  })

  it('keeps the stage filled with the canvas background and handles pre-roll', () => {
    expect(stage).toContain('deployment.config.background')
    expect(stage).toContain('fitScale(')
    expect(stage).toContain("!scene && config.markers !== 'never'")
  })

  it('renders identify without a takeover', () => {
    expect(stage).toContain('if (!takeover)')
    expect(stage).toContain('<IdentifyOverlay')
    expect(overlay).toContain('identify.label')
    expect(overlay).toContain('Frame ${identify.marker} of ${identify.count}')
    expect(overlay).toContain('model.slotRect')
    expect(overlay).toContain('clock.quality')
    expect(stage).toContain('NightOverlay')
    expect(stage).toContain('FrameNoticeLayer')
  })
})
```

- [ ] **Step 3: Run them**

Run: `pnpm vitest run lib/canvas/__tests__/stage.test.ts tests/canvas-display.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `lib/canvas/stage.ts`**

```ts
/** Largest uniform scale that fits a slot inside the viewport. */
export function fitScale(slotW: number, slotH: number, viewportW: number, viewportH: number): number {
  if (!(slotW > 0) || !(slotH > 0) || !(viewportW > 0) || !(viewportH > 0)) return 0
  return Math.min(viewportW / slotW, viewportH / slotH)
}
```

- [ ] **Step 5: Create `components/frame/canvas/identify-overlay.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { CanvasClock } from '@/lib/canvas/clock'
import type { CanvasRenderModel } from '@/lib/canvas/render-model'
import { fontStack } from '@/lib/fonts'

export function IdentifyOverlay({
  model,
  clock,
  frameId,
}: {
  model: CanvasRenderModel
  clock: CanvasClock
  frameId: string
}) {
  const identify = model.identify
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    if (!identify) return
    const id = window.setTimeout(
      () => setVisible(false),
      Math.max(0, identify.until - (Date.now() + clock.offsetMs)),
    )
    return () => window.clearTimeout(id)
  }, [identify?.until, clock.offsetMs])

  if (!identify || !visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/70 text-center">
      <div
        style={{
          fontFamily: fontStack('bebas'),
          fontSize: '55vmin',
          lineHeight: 0.9,
          color: '#ffffff',
          textShadow: '0 12px 48px rgba(0,0,0,0.55)',
        }}
      >
        {identify.marker}
      </div>
      <div style={{ fontFamily: fontStack('grotesk'), fontSize: 44, fontWeight: 600, color: '#e2e8f0' }}>
        {identify.label ?? identify.frameId ?? frameId} · {identify.frameId ?? frameId}
      </div>
      <div style={{ fontFamily: fontStack('grotesk'), fontSize: 32, color: '#f8fafc' }}>
        {identify.canvasName}
      </div>
      <div style={{ fontFamily: fontStack('mono'), fontSize: 26, color: '#cbd5e1' }}>
        Frame {identify.marker} of {identify.count}
      </div>
      <div style={{ fontFamily: fontStack('mono'), fontSize: 22, color: '#94a3b8' }}>
        {model.slotRect ?? 'No slot rectangle'} · Clock {clock.quality}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `components/frame/canvas/canvas-stage.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { NightMode } from '@/lib/types'
import type { CanvasClock } from '@/lib/canvas/clock'
import type { CanvasRenderModel } from '@/lib/canvas/render-model'
import { fitScale } from '@/lib/canvas/stage'
import { sceneAt } from '@/lib/canvas/scheduler'
import { seedFromString } from '@/lib/canvas/prng'
import { sceneStateAt } from '@/lib/canvas/scenes/registry'
import { fontStack } from '@/lib/fonts'
import { NightOverlay } from '@/components/frame/frame-scene'
import { FrameNoticeLayer } from '@/components/notifications/frame-notice-layer'
import { CanvasFrameScene, paintScene, type CanvasElementRefs } from './canvas-frame-scene'
import { IdentifyOverlay } from './identify-overlay'

function subscribeViewport(callback: () => void) {
  window.addEventListener('resize', callback)
  window.addEventListener('focus', callback)
  document.addEventListener('visibilitychange', callback)
  return () => {
    window.removeEventListener('resize', callback)
    window.removeEventListener('focus', callback)
    document.removeEventListener('visibilitychange', callback)
  }
}

function useViewport() {
  const width = useSyncExternalStore(subscribeViewport, () => window.innerWidth, () => 0)
  const height = useSyncExternalStore(subscribeViewport, () => window.innerHeight, () => 0)
  return { width, height }
}

export function CanvasStage({
  model,
  clock,
  night,
  frameId,
  onFps,
}: {
  model: CanvasRenderModel
  clock: CanvasClock
  night: NightMode | null
  frameId: string
  onFps?: (fpsAvg: number) => void
}) {
  const viewport = useViewport()
  const refs = useRef<CanvasElementRefs>(new Map())
  const [scene, setScene] = useState(() => model.plan?.scene ?? null)
  const takeover = model.takeover

  useEffect(() => {
    if (!takeover) return
    const { deployment, geometry, slot } = takeover
    const album = deployment.album
    const seed = album ? seedFromString(album.id) : 0
    let handle = 0
    let last = 0
    let frames = 0
    let windowStart = Date.now()
    const interval = 1000 / Math.max(1, deployment.config.maxFps)

    const tick = (timestamp: number) => {
      handle = requestAnimationFrame(tick)
      if (timestamp - last < interval) return
      last = timestamp
      frames += 1

      const t = Date.now() + clock.offsetMs - deployment.effectiveAt
      const plan = album && t >= 0 ? sceneAt(album, seed, t, album.crossfadeMs) : null
      if (plan && plan.scene.id !== scene?.id) {
        refs.current.clear()
        setScene(plan.scene)
      }
      if (plan) {
        paintScene(sceneStateAt(plan.scene, {
          bounds: { width: geometry.width, height: geometry.height },
          geometry,
          tMs: plan.sceneTimeMs,
          seed: plan.seed,
          slot,
        }), geometry, slot, refs.current)
      }

      const wall = Date.now()
      if (wall - windowStart >= 10_000) {
        const fpsAvg = Math.round(((frames * 1000) / (wall - windowStart)) * 10) / 10
        onFps?.(Math.min(240, fpsAvg))
        frames = 0
        windowStart = wall
      }
    }

    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [takeover, scene, clock.offsetMs, onFps])

  if (!takeover) {
    return (
      <div className="relative h-dvh w-screen overflow-hidden bg-black" data-canvas-frame={frameId}>
        <IdentifyOverlay model={model} clock={clock} frameId={frameId} />
        {night && <NightOverlay night={night} />}
      </div>
    )
  }

  const { deployment, geometry, slot } = takeover
  const scale = fitScale(slot.w, slot.h, viewport.width, viewport.height)
  if (scale <= 0) return null

  const config = deployment.config
  const sceneView = scene && deployment.album
    ? (() => {
        const album = deployment.album!
        const t = Math.max(0, Date.now() + clock.offsetMs - deployment.effectiveAt)
        const plan = sceneAt(album, seedFromString(album.id), t, album.crossfadeMs)
        return plan ? {
          fade: plan.fade,
          render: sceneStateAt(plan.scene, {
            bounds: { width: geometry.width, height: geometry.height },
            geometry,
            tMs: plan.sceneTimeMs,
            seed: plan.seed,
            slot,
          }),
        } : null
      })()
    : null
  const showMarker = !model.identify && (config.markers === 'always' || (!scene && config.markers !== 'never'))

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{ width: slot.w * scale, height: slot.h * scale }}
      data-canvas-frame={frameId}
    >
      <div
        className="absolute left-0 top-0 origin-top-left overflow-hidden"
        style={{ width: slot.w, height: slot.h, transform: `scale(${scale})` }}
      >
        <div
          style={{
            position: 'absolute',
            left: -slot.x,
            top: -slot.y,
            width: geometry.width,
            height: geometry.height,
            background: config.background,
          }}
        >
          {sceneView && (
            <div style={{ position: 'absolute', inset: 0, opacity: sceneView.fade }}>
              <CanvasFrameScene model={sceneView.render} geometry={geometry} slot={slot} refs={refs.current} />
            </div>
          )}
        </div>

        {showMarker && (
          <div
            style={{
              position: 'absolute',
              left: 24,
              top: 24,
              minWidth: 64,
              height: 64,
              padding: '0 16px',
              borderRadius: 12,
              background: 'rgba(0,0,0,0.55)',
              color: '#ffffff',
              fontFamily: fontStack('mono'),
              fontSize: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {slot.marker}
          </div>
        )}

        <IdentifyOverlay model={model} clock={clock} frameId={frameId} />
        {night && <NightOverlay night={night} />}
        {config.notifications === 'show' && <FrameNoticeLayer />}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Wire the takeover into `components/frame/frame-display.tsx`**

Replace the React import line with:

```tsx
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
```

Add imports:

```tsx
import type { CanvasState } from '@/lib/types'
import { SYSTEM_CLOCK, type CanvasClock } from '@/lib/canvas/clock'
import { canvasRenderModel } from '@/lib/canvas/render-model'
import { CanvasStage } from '@/components/frame/canvas/canvas-stage'
```

Add above `FrameDisplay`:

```tsx
type CanvasSnapshot = {
  revision: number
  state: CanvasState | null
  clock: CanvasClock
}
```

Inside `FrameDisplay`, after `const weather = ...`, add:

```tsx
  const { data: canvasData } = useSWR<CanvasSnapshot>(`/api/canvas/state?frame=${encodeURIComponent(frameId)}`, fetcher, {
    refreshInterval: 5_000,
    dedupingInterval: 1_000,
    revalidateOnFocus: false,
    refreshWhenHidden: false,
  })

  const canvasModel = canvasData
    ? canvasRenderModel(canvasData.state, Date.now(), canvasData.clock.offsetMs)
    : null
  const revision = canvasData?.revision ?? null
  const fpsRef = useRef(0)
  const onCanvasFps = useCallback((fpsAvg: number) => { fpsRef.current = fpsAvg }, [])
  const reportWindow = useRef({ at: Date.now() })
  const hasCanvas = Boolean(canvasModel)

  useEffect(() => {
    if (!hasCanvas) return
    const id = window.setInterval(() => {
      const now = Date.now()
      reportWindow.current = { at: now }
      void fetch(`/api/canvas/report?frame=${encodeURIComponent(frameId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appliedRevision: canvasModel ? revision : null,
          viewportW: window.innerWidth,
          viewportH: window.innerHeight,
          fpsAvg: fpsRef.current,
        }),
        keepalive: true,
      }).catch(() => {})
    }, 10_000)
    return () => window.clearInterval(id)
  }, [hasCanvas, revision, frameId])

  const canvasNight = canvasModel?.takeover?.deployment.config.nightMode === 'inherit'
    ? (night ? store.schedule.night : null)
    : null
```

The stage owns the animation loop, so `FrameDisplay` no longer calls `requestAnimationFrame`, `setFrameTick` or `setState` per frame. `fpsRef` is updated by the stage callback and read by the ten-second report.

Then replace the layout branch with:

```tsx
        {canvasModel ? (
          <CanvasStage
            model={canvasModel}
            clock={canvasData?.clock ?? SYSTEM_CLOCK}
            night={canvasNight}
            frameId={frameId}
            onFps={onCanvasFps}
          />
        ) : layout && scale > 0 ? (
          <FrameScene
```

and keep the existing `) : (` fallback. Update the `<h1>`:

```tsx
        <h1 className="sr-only">
          {canvasModel
            ? `Canvas showing ${canvasModel.takeover?.deployment.name ?? canvasModel.identify?.canvasName ?? 'identify'}`
            : layout ? `Frame showing ${layout.name}` : 'Frame display'}
        </h1>
```

The full return block becomes:

```tsx
  return (
    <NotificationProvider notifications={store.notifications}>
      <main className="flex h-dvh w-screen cursor-none items-center justify-center overflow-hidden bg-background">
        <h1 className="sr-only">
          {canvasModel
            ? `Canvas showing ${canvasModel.takeover?.deployment.name ?? canvasModel.identify?.canvasName ?? 'identify'}`
            : layout ? `Frame showing ${layout.name}` : 'Frame display'}
        </h1>
        {store.customFonts.map((family) => (
          <link key={family} rel="stylesheet" href={googleFontHref(family)} precedence="default" />
        ))}
        {canvasModel ? (
          <CanvasStage
            model={canvasModel}
            clock={canvasData?.clock ?? SYSTEM_CLOCK}
            night={canvasNight}
            frameId={frameId}
            onFps={onCanvasFps}
          />
        ) : layout && scale > 0 ? (
          <FrameScene
            widgets={layout.widgets}
            settings={layout.settings}
            weather={weather}
            now={now}
            album={store.albums?.find((a) => a.id === layout.settings.albumId) ?? null}
            scale={scale}
            night={night ? store.schedule.night : null}
          >
            <FrameNoticeLayer />
          </FrameScene>
        ) : (
          <div
            className="relative overflow-hidden"
            style={scale > 0 ? { width: FRAME_WIDTH * scale, height: FRAME_HEIGHT * scale } : { width: FRAME_WIDTH, height: FRAME_HEIGHT }}
          >
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}>
              {!layout && (
                <div className="flex h-full w-full items-start justify-center p-16">
                  <p className="text-sm text-muted-foreground">No layout has been published to this frame yet.</p>
                </div>
              )}
              <FrameNoticeLayer />
            </div>
          </div>
        )}
      </main>
    </NotificationProvider>
  )
```

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/stage.test.ts tests/canvas-display.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/canvas/stage.ts components/frame/canvas/canvas-stage.tsx components/frame/canvas/identify-overlay.tsx components/frame/frame-display.tsx lib/canvas/__tests__/stage.test.ts tests/canvas-display.test.ts
git commit -m "feat(canvas): take over the frame display with the wall"
```

---

### Task 26: Demo deployment route and operator docs

**Files:**
- Create: `app/api/canvas/demo/route.ts`
- Create: `docs/canvas.md`
- Test: `tests/canvas-demo.test.ts`

The demo route gives a local operator a wall to look at without the console: one two-slot row, four scenes and an optional identify overlay. It refuses to run in production unless `CANVAS_DEMO=1`.

- [ ] **Step 1: Write the failing test**

Create `tests/canvas-demo.test.ts`:

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const env = process.env as Record<string, string | undefined>

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-demo'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('canvas demo route', () => {
  beforeEach(freshDb)

  it('creates a deployment with scenes and an identify overlay', async () => {
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a&slot=a&identify=1', { method: 'POST' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.revision).toBe(1)

    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('frame-a')
    expect(row?.data.active?.canvasId).toBe('demo-wall')
    expect(row?.data.active?.slotId).toBe('a')
    expect(row?.data.active?.album?.scenes).toHaveLength(4)
    expect(row?.data.identify?.frameId).toBe('frame-a')
    expect(row?.data.identify?.label).toBe('Left')
    expect(row?.data.identify?.marker).toBe(1)
  })

  it('defaults to the first slot without identify', async () => {
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    const row = await getCanvasState('frame-a')
    expect(row?.data.active?.slotId).toBe('a')
    expect(row?.data.identify).toBeNull()
  })

  it('deletes the row', async () => {
    const { POST, DELETE } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    const res = await DELETE(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'DELETE' }))
    expect(res.status).toBe(204)
    const { getCanvasState } = await import('@/lib/canvas/state-store')
    expect(await getCanvasState('frame-a')).toBeNull()
  })

  it('is hidden in production without the opt-in flag', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    delete env.CANVAS_DEMO
    const { POST } = await import('@/app/api/canvas/demo/route')
    const { NextRequest } = await import('next/server')
    const res = await POST(new NextRequest('http://localhost/api/canvas/demo?frame=frame-a', { method: 'POST' }))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/canvas-demo.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `app/api/canvas/demo/route.ts`**

```ts
import { NextResponse } from 'next/server'
import type { CanvasConfig, CanvasDeployment, CanvasState } from '@/lib/types'
import { canvasStateSchema } from '@/lib/canvas/schema'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { defaultScene } from '@/lib/canvas/scenes/registry'
import { deleteCanvasState, putCanvasState } from '@/lib/canvas/state-store'
import { frameIdParam } from '@/lib/frames/request'
import { remoteEntityId } from '@/lib/sync/ids'

export const dynamic = 'force-dynamic'

const FRAME_ID = /^[a-zA-Z0-9_-]{1,64}$/

function demoConfig(): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 120,
    align: 'center',
    slots: [
      { id: 'a', frameId: 'demo-left', label: 'Left', offset: { x: 0, y: 0 }, scale: 1 },
      { id: 'b', frameId: 'demo-right', label: 'Right', offset: { x: 0, y: 0 }, scale: 1 },
    ],
    background: '#05070d',
    markers: 'always',
    notifications: 'suppress',
    nightMode: 'ignore',
    maxFps: 30,
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.CANVAS_DEMO !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const frameId = frameIdParam(url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })

  const config = demoConfig()
  const geometry = resolveGeometry(config)
  const slotId = url.searchParams.get('slot') === 'b' ? 'b' : 'a'
  const marker = geometry.slots.find((slot) => slot.slotId === slotId)?.marker ?? 1
  const now = Date.now()

  const deployment: CanvasDeployment = {
    canvasId: 'demo-wall',
    name: 'Demo wall',
    revision: 1,
    effectiveAt: now - 1_000,
    releaseAt: null,
    slotId,
    config,
    album: {
      id: 'demo-album',
      name: 'Demo album',
      scenes: [
        defaultScene('marquee', geometry),
        defaultScene('bounce', geometry),
        defaultScene('pong', geometry),
        defaultScene('sync-test', geometry),
      ],
      order: 'sequence',
      crossfadeMs: 800,
    },
  }

  const state: CanvasState = {
    v: 1,
    active: deployment,
    pending: null,
    identify: url.searchParams.get('identify') === '1'
      ? {
          until: now + 60_000,
          canvasName: deployment.name,
          frameId,
          label: config.slots.find((slot) => slot.id === slotId)?.label ?? null,
          marker,
          count: geometry.slots.length,
        }
      : null,
  }

  const parsed = canvasStateSchema.safeParse(state)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid demo state' }, { status: 500 })
  }

  const revision = await putCanvasState(remoteEntityId(frameId), parsed.data)
  return NextResponse.json({ ok: true, revision })
}

export async function DELETE(request: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.CANVAS_DEMO !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const frameId = frameIdParam(request.url) ?? 'home'
  if (!FRAME_ID.test(frameId)) return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 })
  await deleteCanvasState(remoteEntityId(frameId))
  return new NextResponse(null, { status: 204 })
}
```

The demo uses the configured slot label (`Left` or `Right`) for `identify.label`, so the overlay shows a human name rather than the slot id. The schema accepts `string | null`.

- [ ] **Step 4: Write `docs/canvas.md`**

Create the file with the Phase 1 surface:

````markdown
# Multi-frame canvas

A canvas drives several frames from one deployment. Each frame keeps its own
layout and schedule but becomes a window onto one shared scene while a
deployment is live. Releasing the deployment returns the frame to its layout
without restoring anything.

## What phase 1 ships

- Canvas types, schema and album normalization (`kind: 'canvas'`, theme
  `canvas`, presentation `canvas`).
- A `canvas_state` row per instance, with a revision and the last display
  report.
- Deterministic scene state: `marquee`, `bounce`, `pong` and `sync-test`.
  Every scene is a pure function of scene time and seed, so no frame needs to
  know which slot it is.
- Canvas geometry: row, column and grid arrangements with gaps, offsets,
  scales, markers and per-pair gap rectangles.
- Clock estimation from sync pulls, takeover resolution, and a scheduled
  album with sequence or shuffle order.
- A canvas pull on the instance: 5 s while a deployment or identify is present,
  30 s when idle, both with ±10% jitter and backoff on error. It runs the normal
  sync cycle, separate from the 15 minute sync worker.
- Display takeover: `/api/canvas/state` serves the row, the stage clips it to
  the frame's slot, and `/api/canvas/report` records what the display drew.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `CANVAS_POLL_ACTIVE_SECONDS` | `5` | Fast poll while a deployment or identify is present. `0` falls back to `SYNC_INTERVAL_MINUTES`. |
| `CANVAS_POLL_IDLE_SECONDS` | `30` | Fast poll when the canvas row is idle. `0` falls back to `SYNC_INTERVAL_MINUTES`. |
| `SYNC_INTERVAL_MINUTES` | `15` | Regular sync interval, used when a fast-poll override is `0`. |
| `CANVAS_DEMO` | unset | Set to `1` to allow the demo route in production. |
| `SYNC_ENDPOINT`, `SYNC_TOKEN`, `INSTANCE_ID` | unset | Required for canvas delivery. Without them the display has no canvas row. |

## Local walkthrough

1. Run the app with a SQLite database:
   `FRAME_DB_PATH=.data/canvas-demo.db pnpm dev`
2. Create a demo wall for the local frame:
   `curl -X POST 'http://localhost:3000/api/canvas/demo?frame=home&slot=a&identify=1'`
3. Open `http://localhost:3000`. The page shows the marquee, then bounce,
   then pong, then the sync test. The identify overlay counts down for 60
   seconds.
4. Point a second display at slot `b` by making it read the same state row, or
   repeat the request with `slot=b` on a second instance database.
5. Clear it:
   `curl -X DELETE 'http://localhost:3000/api/canvas/demo?frame=home'`

The demo row is local. It does not call the console and it does not survive a
different `FRAME_DB_PATH`.

## Checks

```bash
pnpm test
npx tsc --noEmit
pnpm build
```

## Known limits in phase 1

- There is no canvas editor. The console writes deployments and the demo route
  writes one locally; authoring lands in phase 2.
- The display reports applied revision, viewport and fps, but the console does
  not surface them yet. Reporting lands in phase 3.
- Scenes share one timeline per deployment. Per-scene overrides and the
  catalog land in phase 4.
````

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/canvas-demo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/canvas/demo docs/canvas.md tests/canvas-demo.test.ts
git commit -m "feat(canvas): add a local demo wall and operator notes"
```

---

### Task 27: Phase 1 verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS. The baseline before this phase was 658 passed, 7 skipped; this phase adds the canvas suites.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: the production build completes and the new routes appear (`/api/canvas/state`, `/api/canvas/report`, `/api/canvas/demo`, `/api/time`).

- [ ] **Step 4: Check the acceptance criteria**

Confirm each one against the running code:

- A frame with no canvas row renders its layout exactly as before.
- A live deployment replaces the frame's layout, uses the frame's slot
  rectangle, and draws the scene without the frame knowing its slot.
- `markers: 'identify'`, `'always'` and `'never'` behave as described in the
  schema, and the identify overlay wins over always-on markers.
- Releasing a deployment returns the frame to its layout with no restore step.
- Before `effectiveAt`, the stage shows the background and marker only; an
  identify request shows the full overlay even with no deployment.
- The scene state for a given time and seed is identical on every frame, which
  `lib/canvas/__tests__/continuity.test.ts` checks directly.
- The display reports applied revision, viewport and fps, and the report is
  throttled on the console side.

- [ ] **Step 5: Commit any fixes**

If a check fails, fix it in the smallest change that keeps the phase boundary,
then rerun all three checks and commit:

```bash
git add -A
git commit -m "fix(canvas): address phase 1 check failures"
```

---

## Phase 1 exit criteria

The phase is done when all four checks pass and the manual walkthrough in
`docs/canvas.md` shows the marquee crossing a bezel, the bounce crossing the
whole wall, the pong rally spanning both frames, and the sync test bar moving
in step on every display. Phase 2 adds authoring and console deployment; it
does not change the scene state contract or the takeover flow.






