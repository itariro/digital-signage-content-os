# Multi-frame canvas: phase 5, composition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators stack up to three scene layers, apply wall-wide wipe/iris/chase transitions and shared palettes, and start from six upload-free starter shows.

**Architecture:** Layers are parallel scene schedules over one synced timeline. Each layer's `ScenePlan` comes from the existing `sceneAt`; composition never changes scene-local time. Frame-aware behaviour is confined to transition masks in the renderer: the state functions stay slot-independent. Palettes are six fixed colour sets; scene configs may hold `palette:<token>` strings that are resolved to hex before scene state is computed. Templates are deterministic documents built from catalog defaults with fixed ids and seeds.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, zod 4, Vitest (node), SWR, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-24-multi-frame-canvas-design.md`.
**Assessment and shared contracts:** `docs/superpowers/plans/2026-11-25-multi-frame-canvas/00-assessment.md`.

This plan assumes phases 1 through 4 are merged into the branch. The phase-1 contract names (`sceneAt`, `resolveGeometry`, `canvasRenderModel`, `CanvasStage`, `CanvasAdminPanel`, `AlbumEditor`, `WallPreview`) are used verbatim. Phase 4 supplies all 28 catalog scene types in `CanvasSceneType` and their defaults through `defaultScene`.

Before writing any route, page or editor component, read the relevant guide under `node_modules/next/dist/docs/`. This Next.js is not the version in training data.

---

## File map for this phase

Create:

```
lib/canvas/palettes.ts
lib/canvas/composition.ts
lib/canvas/transitions.ts
lib/canvas/templates.ts
lib/canvas/template-service.ts
lib/canvas/__tests__/types.test.ts
lib/canvas/__tests__/palettes.test.ts
lib/canvas/__tests__/composition.test.ts
lib/canvas/__tests__/schema-composition.test.ts
lib/canvas/__tests__/store-composition.test.ts
lib/canvas/__tests__/transitions.test.ts
lib/canvas/__tests__/render-model-composition.test.ts
lib/canvas/__tests__/templates.test.ts
tests/canvas-template-service.test.ts
tests/canvas-composition-ui.test.ts
tests/canvas-composition-deploy.test.ts
components/frame/canvas/canvas-layer-stack.tsx
components/editor/canvas-admin/template-picker.tsx
components/editor/canvas-admin/canvas-album-options.tsx
```

Modify:

```
lib/types.ts
lib/canvas/schema.ts
lib/schema.ts
lib/store.ts
lib/canvas/render-model.ts
lib/canvas/service.ts
lib/canvas/catalog-kit.ts
components/frame/canvas/canvas-stage.tsx
components/editor/canvas-admin/wall-preview.tsx
components/editor/canvas-admin/albums-tab.tsx
components/editor/canvas-admin/album-editor.tsx
lib/__tests__/store.test.ts
```

---

## Preflight

- [ ] **Step 1: Confirm the branch contains phases 1 through 4**

Run:
```bash
git branch --show-current
git log --oneline -12
test -f lib/canvas/scheduler.ts && test -f lib/canvas/service.ts && test -f components/frame/canvas/canvas-stage.tsx && test -f components/editor/canvas-admin/albums-tab.tsx && echo "base present"
```

Expected: a task branch, not `main`; the log shows the phase 1, 2, 3 and 4 commits; `base present` is printed. The phase-1 display path `components/frame/canvas/canvas-stage.tsx` must exist; this phase uses `components/frame/canvas/...` paths throughout. If a base file is missing, stop: this plan extends those phases.

- [ ] **Step 2: Record the baseline**

Run:
```bash
pnpm test
npx tsc --noEmit
pnpm build
```

Expected: tests pass, TypeScript prints nothing, build succeeds. Save the three outputs in the PR description as the before state.

- [ ] **Step 3: Check for overlapping work**

Run:
```bash
gh pr list --state open
for n in $(gh pr list --state open --json number --jq '.[].number'); do gh pr diff "$n" --name-only; done
```

Expected: no open PR changes `lib/canvas/composition.ts`, `lib/canvas/transitions.ts`, `lib/canvas/templates.ts` or the composition tests. On overlap, stop and report.

---

### Task 1: Phase 5 types and constants

**Files:**
- Modify: `lib/types.ts`
- Test: `lib/canvas/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CANVAS_PALETTE_IDS,
  CANVAS_PALETTE_TOKENS,
  CANVAS_TEMPLATE_IDS,
  CANVAS_TRANSITION_KINDS,
} from '@/lib/types'

describe('phase 5 constants', () => {
  it('defines six palette ids', () => {
    expect(CANVAS_PALETTE_IDS).toEqual(['aurora', 'sunset', 'mono', 'neon', 'forest', 'candy'])
  })

  it('defines the five shared colour tokens', () => {
    expect(CANVAS_PALETTE_TOKENS).toEqual(['primary', 'secondary', 'accent', 'background', 'text'])
  })

  it('defines the transition kinds', () => {
    expect(CANVAS_TRANSITION_KINDS).toEqual(['none', 'wipe', 'iris', 'chase'])
  })

  it('defines exactly six template ids', () => {
    expect(CANVAS_TEMPLATE_IDS).toEqual([
      'hello-wall',
      'sync-check',
      'colour-study',
      'type-parade',
      'arcade-night',
      'wall-clock',
    ])
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/types.test.ts`

Expected: FAIL with "Cannot find module" or "does not provide an export named 'CANVAS_PALETTE_IDS'".

- [ ] **Step 3: Add palette, transition and template types after `CanvasState`**

In `lib/types.ts`, immediately after the closing `}` of `CanvasState` from phase 1, insert:

```ts
export const CANVAS_PALETTE_IDS = ['aurora', 'sunset', 'mono', 'neon', 'forest', 'candy'] as const
export type CanvasPaletteId = (typeof CANVAS_PALETTE_IDS)[number]

export const CANVAS_PALETTE_TOKENS = ['primary', 'secondary', 'accent', 'background', 'text'] as const
export type CanvasPaletteToken = (typeof CANVAS_PALETTE_TOKENS)[number]

export type CanvasPalette = {
  id: CanvasPaletteId
  name: string
  colors: Record<CanvasPaletteToken, string>
}

export const CANVAS_TRANSITION_KINDS = ['none', 'wipe', 'iris', 'chase'] as const
export type CanvasTransitionKind = (typeof CANVAS_TRANSITION_KINDS)[number]
export type CanvasTransitionDirection = 'left' | 'right' | 'up' | 'down'

export type CanvasWallTransition = {
  kind: CanvasTransitionKind
  durationMs: number
  direction: CanvasTransitionDirection
}

export type CanvasLayer = {
  id: string
  name: string
  enabled: boolean
  scenes: CanvasScene[]
  order: 'sequence' | 'shuffle'
  crossfadeMs: number
}

export const CANVAS_TEMPLATE_IDS = [
  'hello-wall',
  'sync-check',
  'colour-study',
  'type-parade',
  'arcade-night',
  'wall-clock',
] as const
export type CanvasTemplateId = (typeof CANVAS_TEMPLATE_IDS)[number]
```

- [ ] **Step 4: Extend `CanvasAlbum`, `Album`, `DeploymentAlbum` and add `CanvasTemplate`**

In `lib/types.ts`, in the phase-1 `Album` type, add after `scenes?: CanvasScene[]`:

```ts
  layers?: CanvasLayer[]
  transition?: CanvasWallTransition
  paletteId?: CanvasPaletteId
```

In the phase-1 `DeploymentAlbum` type, add after `crossfadeMs: number`:

```ts
  layers?: CanvasLayer[]
  transition?: CanvasWallTransition
  palette?: CanvasPalette
```

Immediately after the `Layout` type, insert:

```ts
export type CanvasAlbum = Album & {
  theme: 'canvas'
  scenes: CanvasScene[]
}

export type CanvasTemplate = {
  id: CanvasTemplateId
  name: string
  description: string
  layout: {
    name: string
    kind: 'canvas'
    widgets: []
    canvas: CanvasConfig
    settings: LayoutSettings
  }
  album: Omit<CanvasAlbum, 'id' | 'createdAt' | 'updatedAt'>
}
```

- [ ] **Step 5: Run the test and typecheck**

Run:
```bash
pnpm vitest run lib/canvas/__tests__/types.test.ts
npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/canvas/__tests__/types.test.ts
git commit -m "feat(canvas): add composition types and constants"
```

---

### Task 2: Palettes and colour token resolution

**Files:**
- Create: `lib/canvas/palettes.ts`
- Test: `lib/canvas/__tests__/palettes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/palettes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasScene } from '@/lib/types'
import {
  CANVAS_PALETTES,
  DEFAULT_CANVAS_PALETTE,
  getCanvasPalette,
  isCanvasPaletteId,
  resolveSceneColors,
} from '@/lib/canvas/palettes'

const marquee = (): CanvasScene => ({
  id: 'm1',
  name: 'Marquee',
  enabled: true,
  durationSec: 60,
  seed: 1,
  type: 'marquee',
  config: {
    lines: ['palette:text is a colour token, not a line to replace'],
    layout: 'line',
    separator: '   •   ',
    direction: 'left',
    orientation: 'upright',
    speed: 240,
    repeat: true,
    gap: 600,
    lineHeight: 200,
    fontSize: 160,
    align: 'center',
    crossOffset: 0,
    style: {
      fontFamily: 'bebas',
      fontWeight: 700,
      letterSpacing: 0,
      align: 'center',
      color: 'palette:text',
      accent: 'palette:accent',
      bg: '#000000',
      bgOpacity: 0,
      blur: 0,
      radius: 0,
      stroke: '#ffffff',
      strokeWidth: 0,
      textStroke: 0,
      opacity: 100,
      shadow: false,
    },
  },
})

describe('built-in canvas palettes', () => {
  it('defines six upload-free palettes with five hex colours each', () => {
    expect(CANVAS_PALETTES).toHaveLength(6)
    expect(new Set(CANVAS_PALETTES.map((palette) => palette.id)).size).toBe(6)
    for (const palette of CANVAS_PALETTES) {
      expect(Object.keys(palette.colors).sort()).toEqual(['accent', 'background', 'primary', 'secondary', 'text'])
      for (const color of Object.values(palette.colors)) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
    expect(JSON.stringify(CANVAS_PALETTES)).not.toContain('/api/')
    expect(JSON.stringify(CANVAS_PALETTES)).not.toContain('data:image')
  })

  it('falls back to the neutral palette for unknown or missing ids', () => {
    expect(getCanvasPalette(undefined).id).toBe(DEFAULT_CANVAS_PALETTE.id)
    expect(getCanvasPalette('aurora').id).toBe('aurora')
    expect(isCanvasPaletteId('aurora')).toBe(true)
    expect(isCanvasPaletteId('missing')).toBe(false)
  })
})

describe('resolveSceneColors', () => {
  it('replaces exact palette tokens in nested scene config fields', () => {
    const palette = getCanvasPalette('neon')
    const scene = marquee()
    const resolved = resolveSceneColors(scene, palette)
    expect(resolved.type).toBe('marquee')
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe(palette.colors.text)
    expect(resolved.config.style.accent).toBe(palette.colors.accent)
    expect(resolved.config.lines).toEqual(scene.config.lines)
  })

  it('does not mutate its input', () => {
    const scene = marquee()
    const before = JSON.stringify(scene)
    resolveSceneColors(scene, getCanvasPalette('candy'))
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('uses the default palette when none is supplied', () => {
    const resolved = resolveSceneColors(marquee())
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe(DEFAULT_CANVAS_PALETTE.colors.text)
  })

  it('leaves unknown tokens and non-token strings alone', () => {
    const scene = marquee()
    if (scene.type !== 'marquee') throw new Error('wrong scene')
    scene.config.style.color = 'palette:unknown'
    scene.config.style.accent = '#123456'
    const resolved = resolveSceneColors(scene, getCanvasPalette('mono'))
    if (resolved.type !== 'marquee') throw new Error('wrong scene')
    expect(resolved.config.style.color).toBe('palette:unknown')
    expect(resolved.config.style.accent).toBe('#123456')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/palettes.test.ts`

Expected: FAIL with "Cannot find module '@/lib/canvas/palettes'".

- [ ] **Step 3: Implement `lib/canvas/palettes.ts`**

```ts
import type { CanvasPalette, CanvasPaletteId, CanvasScene } from '@/lib/types'
import { CANVAS_PALETTE_IDS } from '@/lib/types'

export const CANVAS_PALETTES: readonly CanvasPalette[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    colors: { primary: '#22d3ee', secondary: '#818cf8', accent: '#a7f3d0', background: '#071018', text: '#f8fafc' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    colors: { primary: '#fb7185', secondary: '#fbbf24', accent: '#f97316', background: '#180a12', text: '#fff7ed' },
  },
  {
    id: 'mono',
    name: 'Mono',
    colors: { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#ffffff', background: '#050505', text: '#ffffff' },
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: { primary: '#f0abfc', secondary: '#38bdf8', accent: '#fde047', background: '#090418', text: '#faf5ff' },
  },
  {
    id: 'forest',
    name: 'Forest',
    colors: { primary: '#4ade80', secondary: '#facc15', accent: '#2dd4bf', background: '#04120c', text: '#f0fdf4' },
  },
  {
    id: 'candy',
    name: 'Candy',
    colors: { primary: '#f472b6', secondary: '#a78bfa', accent: '#67e8f9', background: '#12091c', text: '#fdf4ff' },
  },
]

export const DEFAULT_CANVAS_PALETTE: CanvasPalette = CANVAS_PALETTES[2]

export function isCanvasPaletteId(value: unknown): value is CanvasPaletteId {
  return typeof value === 'string' && (CANVAS_PALETTE_IDS as readonly string[]).includes(value)
}

export function getCanvasPalette(id: CanvasPaletteId | undefined): CanvasPalette {
  return CANVAS_PALETTES.find((palette) => palette.id === id) ?? DEFAULT_CANVAS_PALETTE
}

const TOKEN_PATTERN = /^palette:([a-z]+)$/

function replaceToken(value: string, palette: CanvasPalette): string {
  const match = TOKEN_PATTERN.exec(value)
  if (!match) return value
  const token = match[1] as keyof CanvasPalette['colors']
  return token in palette.colors ? palette.colors[token] : value
}

function resolveValue(value: unknown, palette: CanvasPalette): unknown {
  if (typeof value === 'string') return replaceToken(value, palette)
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, palette))
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveValue(item, palette)
    return out
  }
  return value
}

/** Return a new scene with every exact `palette:<token>` string replaced by hex. */
export function resolveSceneColors(scene: CanvasScene, palette: CanvasPalette = DEFAULT_CANVAS_PALETTE): CanvasScene {
  return {
    ...scene,
    config: resolveValue(scene.config, palette) as CanvasScene['config'],
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run lib/canvas/__tests__/palettes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/palettes.ts lib/canvas/__tests__/palettes.test.ts
git commit -m "feat(canvas): add built-in palettes and token resolution"
```

---

### Task 3: Layer composition

**Files:**
- Create: `lib/canvas/composition.ts`
- Test: `lib/canvas/__tests__/composition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/composition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasAlbum, CanvasLayer, CanvasScene, DeploymentAlbum } from '@/lib/types'
import { defaultSlideshow } from '@/lib/albums'
import { hash32 } from '@/lib/canvas/prng'
import { sceneAt } from '@/lib/canvas/scheduler'
import {
  BASE_LAYER_ID,
  deploymentAlbumFrom,
  layerPlanAt,
  syncCanvasAlbumLayers,
} from '@/lib/canvas/composition'

const scene = (id: string, durationSec = 10): CanvasScene => ({
  id,
  name: id,
  enabled: true,
  durationSec,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
})

const deployment = (overrides: Partial<DeploymentAlbum> = {}): DeploymentAlbum => ({
  id: 'album-1',
  name: 'Album',
  scenes: [scene('a'), scene('b')],
  order: 'sequence',
  crossfadeMs: 1000,
  ...overrides,
})

const layer = (id: string, scenes: CanvasScene[], enabled = true): CanvasLayer => ({
  id,
  name: id,
  enabled,
  scenes,
  order: 'sequence',
  crossfadeMs: 1000,
})

const album = (overrides: Partial<CanvasAlbum> = {}): CanvasAlbum => ({
  id: 'album-1',
  name: 'Album',
  theme: 'canvas',
  items: [],
  slideshow: defaultSlideshow('canvas'),
  scenes: [scene('a')],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('syncCanvasAlbumLayers', () => {
  it('keeps a phase 1 album's scenes as layer zero', () => {
    const old = album()
    const result = syncCanvasAlbumLayers(old)
    expect(result.scenes).toEqual(old.scenes)
    expect(result.layers).toHaveLength(1)
    expect(result.layers?.[0].id).toBe(BASE_LAYER_ID)
    expect(result.layers?.[0].scenes).toEqual(old.scenes)
    expect(result.transition).toBeUndefined()
    expect(result.paletteId).toBeUndefined()
  })

  it('clamps to three layers and mirrors layer zero back into scenes', () => {
    const layers = [layer('one', [scene('one')]), layer('two', [scene('two')]), layer('three', [scene('three')]), layer('four', [scene('four')])]
    const result = syncCanvasAlbumLayers(album({ layers, scenes: [] }))
    expect(result.layers?.map((item) => item.id)).toEqual(['one', 'two', 'three'])
    expect(result.scenes).toEqual([scene('one')])
  })

  it('sanitizes transition and palette values', () => {
    const result = syncCanvasAlbumLayers(album({
      transition: { kind: 'wipe', durationMs: 99_999, direction: 'sideways' as 'left' },
      paletteId: 'missing' as 'aurora',
    }))
    expect(result.transition).toEqual({ kind: 'wipe', durationMs: 10_000, direction: 'left' })
    expect(result.paletteId).toBeUndefined()
  })
})

describe('layerPlanAt', () => {
  it('composes a phase 1 album unchanged when layers are absent', () => {
    const item = deployment()
    expect(layerPlanAt(item, 42, 15_000)).toEqual([
      {
        layerId: BASE_LAYER_ID,
        index: 0,
        name: 'Album',
        opacity: 1,
        plan: sceneAt(item, 42, 15_000, 1000),
      },
    ])
  })

  it('composes three layers on the same timeline', () => {
    const item = deployment({
      layers: [
        layer('base', [scene('a', 10)]),
        layer('middle', [scene('m', 20)]),
        layer('top', [scene('t', 5)]),
      ],
    })
    const plans = layerPlanAt(item, 42, 3_000)
    expect(plans.map((plan) => plan.layerId)).toEqual(['base', 'middle', 'top'])
    expect(plans.map((plan) => plan.plan?.scene.id)).toEqual(['a', 'm', 't'])
    expect(plans.map((plan) => plan.plan?.sceneTimeMs)).toEqual([3_000, 3_000, 3_000])
  })

  it('skips a disabled layer', () => {
    const item = deployment({
      layers: [layer('base', [scene('a')]), layer('hidden', [scene('h')], false), layer('top', [scene('t')])],
    })
    expect(layerPlanAt(item, 42, 1_000).map((plan) => plan.layerId)).toEqual(['base', 'top'])
  })

  it('keeps fades in phase with sceneAt and never desyncs a neighbour', () => {
    const base = layer('base', [scene('a', 10)])
    const top = layer('top', [scene('t', 10)])
    const item = deployment({ layers: [base, top] })
    const plans = layerPlanAt(item, 42, 500)
    const layerSeed = (index: number) => hash32(42 ^ hash32(index + 1))
    const baseDirect = sceneAt({ id: 'album-1|base', name: 'base', scenes: base.scenes, order: 'sequence', crossfadeMs: 1000 }, layerSeed(0), 500, 1000)
    const topDirect = sceneAt({ id: 'album-1|top', name: 'top', scenes: top.scenes, order: 'sequence', crossfadeMs: 1000 }, layerSeed(1), 500, 1000)
    expect(plans[0].plan).toEqual(baseDirect)
    expect(plans[1].plan).toEqual(topDirect)
    expect(plans[0].plan?.fade).toBeCloseTo(0.5, 5)
    expect(plans[1].plan?.fade).toBeCloseTo(0.5, 5)
    expect(plans[0].plan?.sceneTimeMs).toBe(500)
    expect(plans[1].plan?.sceneTimeMs).toBe(500)

    // A skipped layer keeps its position in the layer array; it does not
    // renumber the layers after it or change their scene-local time or fade.
    const withOff = layerPlanAt(deployment({ layers: [base, layer('off', [scene('x')], false), top] }), 42, 500)
    expect(withOff.map((entry) => entry.layerId)).toEqual(['base', 'top'])
    expect(withOff.map((entry) => entry.index)).toEqual([0, 2])
    expect(withOff.map((entry) => entry.plan?.scene.id)).toEqual(['a', 't'])
    expect(withOff.map((entry) => entry.plan?.sceneTimeMs)).toEqual([500, 500])
    expect(withOff.map((entry) => entry.plan?.fade)).toEqual(plans.map((entry) => entry.plan?.fade))
  })

  it('is deterministic', () => {
    const item = deployment({ layers: [layer('a', [scene('a')]), layer('b', [scene('b')])] })
    expect(layerPlanAt(item, 42, 4_321)).toEqual(layerPlanAt(item, 42, 4_321))
  })
})

describe('deploymentAlbumFrom', () => {
  it('carries layers, transition and a resolved palette into the snapshot', () => {
    const item = album({
      layers: [layer('one', [scene('a')]), layer('two', [scene('b')])],
      transition: { kind: 'chase', durationMs: 800, direction: 'right' },
      paletteId: 'forest',
    })
    const snapshot = deploymentAlbumFrom(item)
    expect(snapshot.layers).toHaveLength(2)
    expect(snapshot.scenes).toEqual([scene('a')])
    expect(snapshot.transition).toEqual({ kind: 'chase', durationMs: 800, direction: 'right' })
    expect(snapshot.palette?.id).toBe('forest')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/composition.test.ts`

Expected: FAIL with "Cannot find module '@/lib/canvas/composition'".

- [ ] **Step 3: Implement `lib/canvas/composition.ts`**

```ts
import type { CanvasAlbum, CanvasLayer, CanvasPalette, CanvasScene, DeploymentAlbum } from '@/lib/types'
import { CANVAS_PALETTE_IDS, CANVAS_TRANSITION_KINDS } from '@/lib/types'
import { hash32 } from './prng'
import { sceneAt, type ScenePlan } from './scheduler'
import { getCanvasPalette } from './palettes'

export const BASE_LAYER_ID = 'base'

export type LayerPlan = {
  layerId: string
  index: number
  name: string
  opacity: number
  plan: ScenePlan | null
}

export function baseLayerFromScenes(
  scenes: CanvasScene[],
  name: string,
  order: 'sequence' | 'shuffle',
  crossfadeMs: number,
): CanvasLayer {
  return {
    id: BASE_LAYER_ID,
    name,
    enabled: true,
    scenes,
    order,
    crossfadeMs,
  }
}

function layersFromDeployment(album: DeploymentAlbum): CanvasLayer[] {
  if (album.layers?.length) return album.layers
  return [baseLayerFromScenes(album.scenes, album.name, album.order, album.crossfadeMs)]
}

/**
 * Keep the phase 1 `scenes` field and layer zero identical. Old albums get one
 * generated layer; invalid new values are clamped instead of rejected so a
 * legacy library document still loads.
 */
export function syncCanvasAlbumLayers(album: CanvasAlbum): CanvasAlbum {
  const base = baseLayerFromScenes(
    album.scenes ?? [],
    album.name,
    album.slideshow.order,
    album.slideshow.canvas?.crossfadeMs ?? 400,
  )
  const raw = album.layers?.length ? album.layers : [base]
  const layers = raw.slice(0, 3).map((item, index) => {
    const crossfade = Number.isFinite(item.crossfadeMs) ? item.crossfadeMs : 400
    return {
      id: typeof item.id === 'string' && item.id ? item.id.slice(0, 40) : `${BASE_LAYER_ID}-${index}`,
      name: typeof item.name === 'string' && item.name ? item.name.slice(0, 60) : `Layer ${index + 1}`,
      enabled: item.enabled !== false,
      scenes: Array.isArray(item.scenes) ? item.scenes : [],
      order: item.order === 'shuffle' ? 'shuffle' : 'sequence',
      crossfadeMs: Math.min(3000, Math.max(0, Math.round(crossfade))),
    }
  })

  const transition = album.transition
    ? {
        kind: (CANVAS_TRANSITION_KINDS as readonly string[]).includes(album.transition.kind) ? album.transition.kind : 'none' as const,
        durationMs: Number.isFinite(album.transition.durationMs)
          ? Math.min(10_000, Math.max(0, Math.round(album.transition.durationMs)))
          : 0,
        direction: (['left', 'right', 'up', 'down'] as const).includes(album.transition.direction)
          ? album.transition.direction
          : 'left' as const,
      }
    : undefined

  const paletteId = album.paletteId && (CANVAS_PALETTE_IDS as readonly string[]).includes(album.paletteId)
    ? album.paletteId
    : undefined

  return {
    ...album,
    layers,
    scenes: layers[0].scenes,
    transition,
    paletteId,
  }
}

/** Build the deployment snapshot album from an authoring album. */
export function deploymentAlbumFrom(album: CanvasAlbum): DeploymentAlbum {
  const synced = syncCanvasAlbumLayers(album)
  const base = synced.layers[0]
  const palette: CanvasPalette = getCanvasPalette(synced.paletteId)
  return {
    id: album.id,
    name: album.name,
    scenes: base.scenes,
    order: base.order,
    crossfadeMs: base.crossfadeMs,
    layers: synced.layers,
    transition: synced.transition ?? { kind: 'none', durationMs: 0, direction: 'left' },
    palette,
  }
}

/**
 * All enabled layers at one instant. Every layer uses the same `tSinceEpochMs`,
 * so a disabled layer or a different scene length cannot shift another layer's
 * scene-local time or fade.
 */
export function layerPlanAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tSinceEpochMs: number,
): LayerPlan[] {
  const layers = layersFromDeployment(album)
  const plans: LayerPlan[] = []
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]
    if (!layer.enabled) continue
    const layerAlbum: DeploymentAlbum = {
      id: `${album.id}|${layer.id}`,
      name: layer.name,
      scenes: layer.scenes,
      order: layer.order,
      crossfadeMs: layer.crossfadeMs,
    }
    plans.push({
      layerId: layer.id,
      index,
      name: layer.name,
      opacity: 1,
      plan: sceneAt(layerAlbum, hash32(albumSeed ^ hash32(index + 1)), tSinceEpochMs, layer.crossfadeMs),
    })
  }
  return plans
}
```

`syncCanvasAlbumLayers` clamps numbers and drops unsupported enum values; it does not depend on wall geometry or a frame slot.

- [ ] **Step 4: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/composition.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/composition.ts lib/canvas/__tests__/composition.test.ts
git commit -m "feat(canvas): compose layered scene plans"
```

---

### Task 4: Schema, normalization and deployment snapshot options

**Files:**
- Modify: `lib/canvas/schema.ts`
- Modify: `lib/schema.ts`
- Modify: `lib/store.ts`
- Modify: `lib/__tests__/store.test.ts`
- Modify: `lib/canvas/service.ts`
- Test: `lib/canvas/__tests__/schema-composition.test.ts`
- Test: `lib/canvas/__tests__/store-composition.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `lib/canvas/__tests__/schema-composition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasScene } from '@/lib/types'
import { albumUpdateSchema, layoutInputSchema } from '@/lib/schema'
import { defaultSlideshow } from '@/lib/albums'
import { catalogConfigSchema } from '@/lib/canvas/catalog-kit'
import {
  canvasLayerSchema,
  canvasSceneSchema,
  canvasWallTransitionSchema,
  deploymentAlbumSchema,
} from '@/lib/canvas/schema'

const syncTest = (): CanvasScene => ({
  id: 's1',
  name: 'Sync',
  enabled: true,
  durationSec: 30,
  seed: 1,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
})

const baseAlbum = () => ({
  name: 'Canvas',
  theme: 'canvas' as const,
  items: [],
  slideshow: defaultSlideshow('canvas'),
  scenes: [syncTest()],
})

describe('canvas composition schemas', () => {
  it('accepts palette tokens in scene colour fields', () => {
    const scene = syncTest()
    const parsed = canvasSceneSchema.safeParse({
      ...scene,
      type: 'pong',
      config: {
        axis: 'auto',
        paddle: { w: 24, h: 220, inset: 40 },
        ballSize: 28,
        baseSpeed: 900,
        rallyHits: [2, 7],
        pointsPerMatch: 7,
        serveDelayMs: 900,
        pointPauseMs: 1200,
        showScore: true,
        colors: { ball: 'palette:text', paddles: 'palette:accent', net: 'palette:secondary', text: 'palette:text' },
        scoreStyle: {
          fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center',
          color: 'palette:text', accent: 'palette:accent', bg: '#000000', bgOpacity: 0,
          blur: 0, radius: 0, stroke: 'palette:primary', strokeWidth: 0, textStroke: 0,
          opacity: 100, shadow: false,
        },
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts palette tokens in catalog colours', () => {
    expect(catalogConfigSchema.safeParse({ colors: ['palette:primary', '#ffffff'] }).success).toBe(true)
    expect(catalogConfigSchema.safeParse({ colors: ['palette:nope'] }).success).toBe(false)
  })

  it('rejects malformed palette tokens', () => {
    const scene = syncTest()
    const parsed = canvasSceneSchema.safeParse({
      ...scene,
      type: 'pong',
      config: {
        axis: 'auto',
        paddle: { w: 24, h: 220, inset: 40 },
        ballSize: 28,
        baseSpeed: 900,
        rallyHits: [2, 7],
        pointsPerMatch: 7,
        serveDelayMs: 900,
        pointPauseMs: 1200,
        showScore: true,
        colors: { ball: 'palette:nope', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
        scoreStyle: {
          fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center',
          color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0,
          blur: 0, radius: 0, stroke: '#ffffff', strokeWidth: 0, textStroke: 0,
          opacity: 100, shadow: false,
        },
      },
    })
    expect(parsed.success).toBe(false)
  })

  it('validates layers, transitions and palette ids on albums', () => {
    const layer = { id: 'base', name: 'Base', enabled: true, scenes: [syncTest()], order: 'sequence', crossfadeMs: 400 }
    expect(canvasLayerSchema.safeParse(layer).success).toBe(true)
    expect(canvasWallTransitionSchema.safeParse({ kind: 'iris', durationMs: 500, direction: 'up' }).success).toBe(true)
    expect(canvasWallTransitionSchema.safeParse({ kind: 'wipe', durationMs: -1, direction: 'left' }).success).toBe(false)
    expect(albumUpdateSchema.safeParse({ ...baseAlbum(), layers: [layer], transition: { kind: 'wipe', durationMs: 400, direction: 'left' }, paletteId: 'aurora' }).success).toBe(true)
    expect(albumUpdateSchema.safeParse({ ...baseAlbum(), layers: [layer], paletteId: 'missing' }).success).toBe(false)
    expect(albumUpdateSchema.safeParse({ ...baseAlbum(), layers: [] }).success).toBe(false)
    expect(albumUpdateSchema.safeParse({ ...baseAlbum(), layers: [{ ...layer, scenes: [] }] }).success).toBe(false)
  })

  it('accepts the new deployment album options', () => {
    const layer = { id: 'base', name: 'Base', enabled: true, scenes: [syncTest()], order: 'sequence', crossfadeMs: 400 }
    const snapshot = {
      id: 'a', name: 'A', scenes: [syncTest()], order: 'sequence', crossfadeMs: 400,
      layers: [layer],
      transition: { kind: 'chase', durationMs: 600, direction: 'right' },
      palette: { id: 'mono', name: 'Mono', colors: { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#ffffff', background: '#050505', text: '#ffffff' } },
    }
    expect(deploymentAlbumSchema.safeParse(snapshot).success).toBe(true)
  })

  it('keeps layout validation unchanged', () => {
    const settings = {
      resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0,
      units: 'metric', snap: true, gridSize: 20, albumId: null,
    }
    expect(layoutInputSchema.safeParse({ name: 'Wall', widgets: [], settings, kind: 'canvas' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/schema-composition.test.ts`

Expected: FAIL because palette tokens, layers, transitions and palette ids are not in the schemas yet.

- [ ] **Step 3: Extend `lib/canvas/schema.ts`**

Replace the first import block of phase 1:

```ts
import { hex, widgetStyleSchema } from '@/lib/widget-style-schema'
```

with:

```ts
import { widgetStyleSchema as baseWidgetStyleSchema } from '@/lib/widget-style-schema'
import { CANVAS_PALETTE_IDS, CANVAS_TRANSITION_KINDS } from '@/lib/types'
```

Then insert this block immediately below the imports:

```ts
const hexLiteral = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const paletteColor = z.string().regex(/^palette:(primary|secondary|accent|background|text)$/)
const hex: z.ZodType<string> = z.union([hexLiteral, paletteColor])
const widgetStyleSchema = baseWidgetStyleSchema.extend({
  color: hex,
  accent: hex,
  bg: hex,
  stroke: hex,
})
```

Phase 1 scene configs in this file already use the local `hex` and `widgetStyleSchema` names, so they accept palette tokens with no further edits to their config objects. The palette schema itself uses `hexLiteral`.

Phase 4 catalog configs live in `lib/canvas/catalog-kit.ts`, whose `catalogConfigSchema` still has a literal-only `hex`. Add a token-accepting colour beside `hex` in that file:

```ts
const catalogColor = z.union([hex, z.string().regex(/^palette:(primary|secondary|accent|background|text)$/)])
```

Then change only the colours line in `catalogConfigSchema`:

```ts
  colors: z.array(catalogColor).max(12).optional(),
```

Keep the rest of the schema strict and literal. Without this edit, every catalog scene in the starter shows fails schema validation because `paint()` writes `palette:` tokens into `config.colors`.

Change one line in the phase-1 `canvasConfigSchema`: replace `background: hex.default('#000000')` with `background: hexLiteral.default('#000000')`. The wall background is a CSS colour, not a scene colour, so it must stay a literal hex value. The nested style fields (`fill`, `textStrokeCfg`, `lightingShadow`) also stay literal hex; templates use only the five top-level style colour fields that the new `widgetStyleSchema` accepts as tokens.

Insert these schemas before `export const deploymentAlbumSchema`:

```ts
export const canvasLayerSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  enabled: z.boolean(),
  scenes: z.array(canvasSceneSchema).min(1).max(50),
  order: z.enum(['sequence', 'shuffle']),
  crossfadeMs: z.number().int().min(0).max(3000),
})

export const canvasWallTransitionSchema = z.object({
  kind: z.enum(CANVAS_TRANSITION_KINDS),
  durationMs: z.number().int().min(0).max(10_000),
  direction: z.enum(['left', 'right', 'up', 'down']),
})

export const canvasPaletteSchema = z.object({
  id: z.enum(CANVAS_PALETTE_IDS),
  name: z.string().min(1).max(40),
  colors: z.object({
    primary: hexLiteral,
    secondary: hexLiteral,
    accent: hexLiteral,
    background: hexLiteral,
    text: hexLiteral,
  }),
})
```

Replace the `deploymentAlbumSchema` block with:

```ts
export const deploymentAlbumSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  scenes: z.array(canvasSceneSchema).max(50),
  order: z.enum(['sequence', 'shuffle']),
  crossfadeMs: z.number().int().min(0).max(3000),
  layers: z.array(canvasLayerSchema).min(1).max(3).optional(),
  transition: canvasWallTransitionSchema.optional(),
  palette: canvasPaletteSchema.optional(),
})
```

- [ ] **Step 4: Extend `lib/schema.ts`**

In the existing import from `./types`, add `CANVAS_PALETTE_IDS`:

```ts
import { ALBUM_THEMES, CANVAS_PALETTE_IDS, PRESENTATIONS, WIDGET_TYPES } from './types'
```

Add to the canvas schema import:

```ts
import { canvasConfigSchema, canvasLayerSchema, canvasSceneSchema, canvasWallTransitionSchema } from './canvas/schema'
```

Replace `albumUpdateSchema` with this complete block:

```ts
export const albumUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  theme: z.enum(ALBUM_THEMES),
  items: z.array(albumItemSchema).max(200),
  slideshow: slideshowSchema,
  mapArt: mapArtSettingsSchema.optional(),
  subject: subjectSchema.nullable().optional(),
  scenes: z.array(canvasSceneSchema).max(50).optional(),
  layers: z.array(canvasLayerSchema).min(1).max(3).optional(),
  transition: canvasWallTransitionSchema.optional(),
  paletteId: z.enum(CANVAS_PALETTE_IDS).optional(),
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
    if (album.layers && JSON.stringify(album.layers[0].scenes) !== JSON.stringify(album.scenes)) {
      ctx.addIssue({ code: 'custom', message: 'Layer zero must mirror scenes', path: ['layers', 0, 'scenes'] })
    }
  } else if (album.layers || album.transition || album.paletteId) {
    ctx.addIssue({ code: 'custom', message: 'Only canvas albums use layers, transitions and palettes', path: ['layers'] })
  }
})
```

- [ ] **Step 5: Run the schema test**

Run: `pnpm vitest run lib/canvas/__tests__/schema-composition.test.ts lib/canvas/__tests__/schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Write the failing normalization test**

Create `lib/canvas/__tests__/store-composition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultSlideshow } from '@/lib/albums'
import type { CanvasScene } from '@/lib/types'
import { normalize, seed } from '@/lib/store'

const scene = (id: string): CanvasScene => ({
  id, name: id, enabled: true, durationSec: 30, seed: 1,
  type: 'sync-test', config: { periodSec: 4, showGrid: true, showBezels: true },
})

function put(store: ReturnType<typeof seed>, overrides: Record<string, unknown>) {
  store.albums.push({
    id: 'canvas-comp',
    name: 'Composition',
    theme: 'canvas',
    items: [],
    slideshow: defaultSlideshow('canvas'),
    scenes: [scene('a')],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as never)
  return normalize(store).albums.find((album) => album.id === 'canvas-comp')!
}

describe('normalize composition fields', () => {
  it('adds one layer to a phase 1 album without changing its scenes', () => {
    const result = put(seed(), {})
    expect(result.scenes).toEqual([scene('a')])
    expect(result.layers).toHaveLength(1)
    expect(result.layers?.[0].scenes).toEqual([scene('a')])
  })

  it('mirrors layer zero and keeps other layers', () => {
    const second = { id: 'top', name: 'Top', enabled: false, scenes: [scene('b')], order: 'shuffle', crossfadeMs: 900 }
    const result = put(seed(), {
      scenes: [],
      layers: [{ id: 'base', name: 'Base', enabled: true, scenes: [scene('z')], order: 'sequence', crossfadeMs: 500 }, second],
    })
    expect(result.scenes).toEqual([scene('z')])
    expect(result.layers?.[1]).toEqual(second)
  })

  it('drops invalid palette ids and clamps transition values', () => {
    const result = put(seed(), {
      paletteId: 'missing',
      transition: { kind: 'wipe', durationMs: -3, direction: 'nowhere' },
    })
    expect(result.paletteId).toBeUndefined()
    expect(result.transition).toEqual({ kind: 'wipe', durationMs: 0, direction: 'left' })
  })
})
```

- [ ] **Step 7: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/store-composition.test.ts`

Expected: FAIL because normalize does not create layers or sanitize composition fields.

- [ ] **Step 8: Update `lib/store.ts`**

Add imports at the top:

```ts
import type { CanvasAlbum } from './types'
import { syncCanvasAlbumLayers } from './canvas/composition'
```

Locate the phase-1 canvas branch in `normalize` (it starts `if (next.theme === 'canvas') {`). Replace the whole branch with:

```ts
    if (next.theme === 'canvas') {
      const crossfadeMs = clampLegacyNumber(show.canvas?.crossfadeMs, 0, 3000, 400)
      const synced = syncCanvasAlbumLayers({
        ...next,
        scenes: next.scenes ?? [],
        layers: next.layers,
        transition: next.transition,
        paletteId: next.paletteId,
      } as CanvasAlbum)
      return {
        ...next,
        ...synced,
        items: [],
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

- [ ] **Step 9: Run normalization tests**

Run:
```bash
pnpm vitest run lib/canvas/__tests__/store-composition.test.ts lib/__tests__/store.test.ts
```

Expected: PASS, including the phase-1 tests that assert old albums keep their scenes and clamped crossfade.

- [ ] **Step 10: Put composition options into deployment snapshots**

Add this import to `lib/canvas/service.ts`:

```ts
import { deploymentAlbumFrom } from './composition'
```

Find the phase-2 snapshot literal in `deployCanvas`. It starts with `const deploymentAlbum: DeploymentAlbum = {` and has properties `id`, `name`, `scenes`, `order` and `crossfadeMs`. Replace that whole declaration with:

```ts
  const deploymentAlbum = deploymentAlbumFrom(album as CanvasAlbum)
```

Leave the existing `album: deploymentAlbum` line in each `CanvasDeployment` unchanged. At this point in `deployCanvas` the album is already non-null, so no ternary is needed.

Add `CanvasAlbum` to the type import from `@/lib/types` in that file.

Create `tests/canvas-composition-deploy.test.ts` with this complete content:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const service = readFileSync(path.join(root, 'lib/canvas/service.ts'), 'utf8')

describe('canvas deployment snapshot composition', () => {
  it('uses deploymentAlbumFrom so layers, transition and palette reach the frame', () => {
    expect(service).toContain("import { deploymentAlbumFrom } from './composition'")
    expect(service).toContain('const deploymentAlbum = deploymentAlbumFrom(album as CanvasAlbum)')
    expect(service).toContain('album: deploymentAlbum')
  })

  it('keeps the snapshot schema permissive for old deployments', async () => {
    const { deploymentAlbumSchema } = await import('@/lib/canvas/schema')
    expect(deploymentAlbumSchema.safeParse({
      id: 'a', name: 'A', scenes: [], order: 'sequence', crossfadeMs: 400,
    }).success).toBe(true)
  })
})
```

- [ ] **Step 11: Run the service tests and typecheck**

Run:
```bash
pnpm vitest run tests/canvas-composition-deploy.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add lib/types.ts lib/canvas/schema.ts lib/canvas/catalog-kit.ts lib/schema.ts lib/store.ts lib/canvas/service.ts lib/canvas/__tests__/schema-composition.test.ts lib/canvas/__tests__/store-composition.test.ts lib/__tests__/store.test.ts tests/canvas-composition-deploy.test.ts
git commit -m "feat(canvas): validate and persist composition options"
```

---

### Task 5: Wall-wide transitions

**Files:**
- Create: `lib/canvas/transitions.ts`
- Test: `lib/canvas/__tests__/transitions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/transitions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import {
  transitionClipPath,
  transitionMaskAt,
  transitionProgress,
} from '@/lib/canvas/transitions'

const config = (gap: number, count = 2): CanvasConfig => ({
  arrangement: 'row',
  gap,
  align: 'center',
  slots: Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    frameId: `f${index}`,
    offset: { x: 0, y: 0 },
    scale: 1,
  })),
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
})

describe('transitionProgress', () => {
  it('is 1 for no transition and clamps time into 0..1', () => {
    expect(transitionProgress(undefined, 0)).toBe(1)
    expect(transitionProgress({ kind: 'none', durationMs: 500, direction: 'left' }, 0)).toBe(1)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, -1)).toBe(0)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, 500)).toBe(0.5)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, 5000)).toBe(1)
  })
})

describe('transitionMaskAt', () => {
  const geometry = resolveGeometry(config(120, 2))

  it('starts empty and ends full for every kind', () => {
    for (const kind of ['wipe', 'iris', 'chase'] as const) {
      for (const slot of geometry.slots) {
        expect(transitionMaskAt(kind, 0, slot, geometry).coverage).toBe(0)
        expect(transitionMaskAt(kind, 1, slot, geometry).coverage).toBe(1)
      }
    }
  })

  it('wipes with one wall-wide front at t=0, mid and t=1', () => {
    const [left, right] = geometry.slots
    const start = transitionMaskAt('wipe', 0, left, geometry)
    const midLeft = transitionMaskAt('wipe', 0.5, left, geometry)
    const midRight = transitionMaskAt('wipe', 0.5, right, geometry)
    const end = transitionMaskAt('wipe', 1, right, geometry)
    expect(start.coverage).toBe(0)
    expect(start.front).toBe(0)
    // At p=0.5 the wall front sits at 1140 px, inside the 120 px gap between
    // the two frames: the left frame is fully revealed and the right untouched.
    expect(midLeft.coverage).toBe(1)
    expect(midRight.coverage).toBe(0)
    expect(midLeft.front).toBe(midRight.front)
    expect(midLeft.front).toBe(1140)
    expect(end.coverage).toBe(1)
    expect(end.front).toBe(geometry.width)
  })

  it('keeps the wipe front continuous at the bezel', () => {
    const [left, right] = geometry.slots
    const atBezel = 1080 / geometry.width
    const justBefore = transitionMaskAt('wipe', atBezel - 0.001, left, geometry)
    const atEdge = transitionMaskAt('wipe', atBezel, left, geometry)
    const afterGap = transitionMaskAt('wipe', (1080 + 120) / geometry.width, right, geometry)
    expect(atEdge.coverage).toBe(1)
    expect(justBefore.coverage).toBeLessThan(1)
    expect(afterGap.coverage).toBe(0)
    expect(justBefore.front).toBeLessThan(left.x + left.w)
    expect(atEdge.front).toBeCloseTo(left.x + left.w, 6)
    expect(afterGap.front).toBeCloseTo(right.x, 6)
  })

  it('wipes from any direction', () => {
    const [left, right] = geometry.slots
    // Reverse travel at p=0.5 stops at 1140 px, so the left frame is still
    // hidden and the right frame is already fully revealed.
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'right').coverage).toBe(0)
    expect(transitionMaskAt('wipe', 0.5, right, geometry, 'right').coverage).toBe(1)
    // Vertical travel spans the wall height (1920 px), so half way both
    // full-height slots are half covered.
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'up').coverage).toBeCloseTo(0.5, 4)
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'down').coverage).toBeCloseTo(0.5, 4)
  })

  it('opens an iris from the wall centre', () => {
    const three = resolveGeometry(config(0, 3))
    const middle = three.slots[1]
    const edge = three.slots[0]
    const middleMid = transitionMaskAt('iris', 0.5, middle, three)
    const edgeMid = transitionMaskAt('iris', 0.5, edge, three)
    expect(middleMid.radius).toBe(edgeMid.radius)
    expect(middleMid.coverage).toBeGreaterThanOrEqual(edgeMid.coverage)
    expect(transitionMaskAt('iris', 1, edge, three).coverage).toBe(1)
  })

  it('chases slot indexes rather than measuring a wall position', () => {
    const three = resolveGeometry(config(0, 3))
    expect(transitionMaskAt('chase', 0, three.slots[0], three).coverage).toBe(0)
    expect(transitionMaskAt('chase', 1 / 3, three.slots[0], three).coverage).toBe(1)
    expect(transitionMaskAt('chase', 1 / 3, three.slots[1], three).coverage).toBe(0)
    expect(transitionMaskAt('chase', 0.5, three.slots[1], three).coverage).toBeCloseTo(0.5, 4)
    expect(transitionMaskAt('chase', 1, three.slots[2], three).coverage).toBe(1)
  })
})

describe('transitionClipPath', () => {
  it('clips in the direction of travel', () => {
    // One slot keeps coverage equal to progress: two slots spread the wall
    // front over 2160 px, so p=0.25 would cover half of the left frame.
    const single = resolveGeometry(config(0, 1))
    const mask = transitionMaskAt('wipe', 0.25, single.slots[0], single)
    expect(transitionClipPath('none', mask, 'left')).toBe('none')
    expect(transitionClipPath('wipe', mask, 'left')).toBe('inset(0 75% 0 0)')
    expect(transitionClipPath('wipe', mask, 'right')).toBe('inset(0 0 0 75%)')
    expect(transitionClipPath('wipe', mask, 'up')).toBe('inset(0 0 75% 0)')
    expect(transitionClipPath('wipe', mask, 'down')).toBe('inset(75% 0 0 0)')
    expect(transitionClipPath('chase', mask, 'left')).toBe('inset(0 75% 0 0)')
    expect(transitionClipPath('iris', mask, 'left')).toMatch(/^circle\(37\.5% at 50% 50%\)$/)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/transitions.test.ts`

Expected: FAIL with "Cannot find module '@/lib/canvas/transitions'".

- [ ] **Step 3: Implement `lib/canvas/transitions.ts`**

```ts
import type { CanvasTransitionDirection, CanvasTransitionKind, CanvasWallTransition } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from './geometry'
import { clamp } from './math'

export type TransitionMask = {
  progress: number
  coverage: number
  front: number
  radius: number
  slotIndex: number
  axis: 'x' | 'y'
}

export function transitionProgress(transition: CanvasWallTransition | undefined, tMs: number): number {
  if (!transition || transition.kind === 'none' || !(transition.durationMs > 0)) return 1
  if (!Number.isFinite(tMs)) return 0
  return clamp(tMs / transition.durationMs, 0, 1)
}

function cornerDistances(rect: { x: number; y: number; w: number; h: number }, cx: number, cy: number): number[] {
  return [
    Math.hypot(rect.x - cx, rect.y - cy),
    Math.hypot(rect.x + rect.w - cx, rect.y - cy),
    Math.hypot(rect.x - cx, rect.y + rect.h - cy),
    Math.hypot(rect.x + rect.w - cx, rect.y + rect.h - cy),
  ]
}

function irisCoverage(progress: number, slot: ResolvedSlot, geometry: ResolvedGeometry): { coverage: number; radius: number } {
  const cx = geometry.width / 2
  const cy = geometry.height / 2
  const slotDistances = cornerDistances(slot, cx, cy)
  const near = Math.min(...slotDistances)
  const far = Math.max(...slotDistances)
  const wallFar = Math.max(...geometry.slots.flatMap((item) => cornerDistances(item, cx, cy)))
  const radius = progress * wallFar
  if (!(far > near)) return { coverage: progress >= 1 ? 1 : 0, radius }
  return { coverage: clamp((radius - near) / (far - near), 0, 1), radius }
}

/**
 * Pure per-slot mask. `wipe` and `iris` use wall coordinates, so the same front
 * or radius reaches every frame at the same instant. `chase` deliberately uses
 * `slot.index`, which is the one frame-aware transition.
 */
export function transitionMaskAt(
  kind: CanvasTransitionKind,
  progress: number,
  slot: ResolvedSlot,
  geometry: ResolvedGeometry,
  direction: CanvasTransitionDirection = 'left',
): TransitionMask {
  const p = clamp(progress, 0, 1)
  const axis: 'x' | 'y' = direction === 'up' || direction === 'down' ? 'y' : 'x'
  const length = axis === 'x' ? geometry.width : geometry.height
  const start = axis === 'x' ? slot.x : slot.y
  const span = Math.max(1, axis === 'x' ? slot.w : slot.h)
  const forward = direction === 'left' || direction === 'up'
  const front = forward ? p * length : length - p * length
  const radial = irisCoverage(p, slot, geometry)

  let coverage = 0
  if (kind === 'iris') {
    coverage = radial.coverage
  } else if (kind === 'chase') {
    const slots = Math.max(1, geometry.slots.length)
    coverage = clamp(p * slots - slot.index, 0, 1)
  } else if (kind !== 'none') {
    coverage = forward
      ? clamp((front - start) / span, 0, 1)
      : clamp((start + span - front) / span, 0, 1)
  }

  return {
    progress: p,
    coverage,
    front,
    radius: radial.radius,
    slotIndex: slot.index,
    axis,
  }
}

/** CSS clip for a slot-sized element. The mask stays pure; this only formats it. */
export function transitionClipPath(
  kind: CanvasTransitionKind,
  mask: TransitionMask,
  direction: CanvasTransitionDirection = 'left',
): string {
  if (kind === 'none') return 'none'
  const remaining = Math.max(0, 100 - mask.coverage * 100)
  if (kind === 'iris') return `circle(${Math.min(150, mask.coverage * 150)}% at 50% 50%)`
  if (direction === 'right') return `inset(0 0 0 ${remaining}%)`
  if (direction === 'up') return `inset(0 0 ${remaining}% 0)`
  if (direction === 'down') return `inset(${remaining}% 0 0 0)`
  return `inset(0 ${remaining}% 0 0)`
}
```

- [ ] **Step 4: Check the clip path test expectation**

Run: `pnpm vitest run lib/canvas/__tests__/transitions.test.ts`

Expected: PASS. With one slot, `progress = 0.25` gives `coverage = 0.25` and the iris string is `circle(37.5% at 50% 50%)`.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/transitions.ts lib/canvas/__tests__/transitions.test.ts
git commit -m "feat(canvas): add wall-wide transition masks"
```

---

### Task 6: Compose layers and masks in the render model and display

**Files:**
- Modify: `lib/canvas/render-model.ts`
- Create: `components/frame/canvas/canvas-layer-stack.tsx`
- Modify: `components/frame/canvas/canvas-stage.tsx`
- Modify: `components/editor/canvas-admin/wall-preview.tsx`
- Test: `lib/canvas/__tests__/render-model-composition.test.ts`
- Test: `tests/canvas-layer-stack.test.ts`

- [ ] **Step 1: Write the failing render-model test**

Create `lib/canvas/__tests__/render-model-composition.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasLayer, CanvasScene, CanvasState } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { getCanvasPalette } from '@/lib/canvas/palettes'
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
const sync = defaultScene('sync-test', geometry)

const layers: CanvasLayer[] = [
  { id: 'base', name: 'Base', enabled: true, scenes: [marquee], order: 'sequence', crossfadeMs: 1000 },
  { id: 'top', name: 'Top', enabled: true, scenes: [sync], order: 'sequence', crossfadeMs: 1000 },
]

function state(slotId = 'a', overrides: Partial<CanvasDeployment> = {}): CanvasState {
  const active: CanvasDeployment = {
    canvasId: 'wall', name: 'Wall', revision: 1, effectiveAt: 10_000, releaseAt: null,
    slotId, config,
    album: {
      id: 'album-1', name: 'Album', scenes: [marquee], order: 'sequence', crossfadeMs: 1000,
      layers,
      transition: { kind: 'wipe', durationMs: 1000, direction: 'left' },
      palette: { id: 'mono', name: 'Mono', colors: { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#ffffff', background: '#050505', text: '#ffffff' } },
    },
    ...overrides,
  }
  return { v: 1, active, pending: null, identify: null }
}

describe('layered render model', () => {
  it('renders one layer stack item per enabled layer', () => {
    const model = canvasRenderModel(state(), 10_500)!
    expect(model.layers.map((layer) => layer.layerId)).toEqual(['base', 'top'])
    expect(model.layers.map((layer) => layer.render?.type)).toEqual(['marquee', 'sync-test'])
    expect(model.plan?.scene.id).toBe(marquee.id)
    expect(model.render?.type).toBe('marquee')
  })

  it('skips disabled layers', () => {
    const off = layers.map((layer, index) => index === 1 ? { ...layer, enabled: false } : layer)
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: { ...active.album!, layers: off },
    }), 10_500)!
    expect(model.layers.map((layer) => layer.layerId)).toEqual(['base'])
  })

  it('keeps scene state slot-independent while masks differ by slot', () => {
    const left = canvasRenderModel(state('a'), 10_500)!
    const right = canvasRenderModel(state('b'), 10_500)!
    expect(left.layers.map((layer) => layer.render)).toEqual(right.layers.map((layer) => layer.render))
    expect(left.layers[1].mask.coverage).toBe(1)
    expect(right.layers[1].mask.coverage).toBe(0)
    expect(left.layers[1].mask.front).toBe(right.layers[1].mask.front)
  })

  it('falls back to one layer for a phase 1 snapshot', () => {
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: {
        id: active.album!.id, name: active.album!.name, scenes: [marquee],
        order: 'sequence', crossfadeMs: 1000,
      },
    }), 10_500)!
    expect(model.layers).toHaveLength(1)
    expect(model.layers[0].layerId).toBe('base')
    expect(model.layers[0].render?.type).toBe('marquee')
  })

  it('resolves palette tokens before computing scene state', () => {
    const colored: CanvasScene = {
      ...marquee,
      type: 'marquee',
      config: { ...marquee.config, style: { ...marquee.config.style, color: 'palette:text' } },
    } as CanvasScene
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: { ...active.album!, scenes: [colored], layers: [{ ...layers[0], scenes: [colored] }] },
    }), 10_500)!
    expect(model.layers[0].render?.config).toMatchObject({
      style: { color: getCanvasPalette('mono').colors.text },
    })
    expect(colored.config.style.color).toBe('palette:text')
  })
})
```

- [ ] **Step 2: Create the failing UI wiring test**

Create `tests/canvas-layer-stack.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const stack = readFileSync(path.join(root, 'components/frame/canvas/canvas-layer-stack.tsx'), 'utf8')
const stage = readFileSync(path.join(root, 'components/frame/canvas/canvas-stage.tsx'), 'utf8')
const preview = readFileSync(path.join(root, 'components/editor/canvas-admin/wall-preview.tsx'), 'utf8')

describe('canvas layer stack wiring', () => {
  it('draws every layer with its own clip, opacity and refs', () => {
    expect(stack).toContain('layers.map(')
    expect(stack).toContain('layer.clipPath')
    expect(stack).toContain('layer.plan?.fade')
    expect(stack).toContain("from './canvas-frame-scene'")
    expect(stack).toContain('refs: CanvasElementRefs')
    expect(stack).toContain('refsForLayer(refsByLayer, layer.layerId)')
  })

  it('is used by the frame stage and the console wall preview', () => {
    expect(stage).toContain('<CanvasLayerStack')
    expect(stage).toContain('refsByLayer={refsByLayer.current}')
    expect(stage).toContain('layerRendersAt(')
    expect(preview).toContain('<CanvasLayerStack')
    expect(preview).toContain('refsByLayer={slotRefs}')
    expect(preview).toContain('layerRendersAt(')
  })
})
```

- [ ] **Step 3: Run both tests**

Run:
```bash
pnpm vitest run lib/canvas/__tests__/render-model-composition.test.ts tests/canvas-layer-stack.test.ts
```

Expected: FAIL because `canvasRenderModel` has no `layers` and `canvas-layer-stack.tsx` does not exist.

- [ ] **Step 4: Replace `lib/canvas/render-model.ts` with the layered version**

```ts
import type { CanvasIdentify, CanvasState, DeploymentAlbum } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from './geometry'
import { resolveCanvasTakeover, type CanvasTakeover } from './takeover'
import { sceneAt, type ScenePlan } from './scheduler'
import { computeSceneState, type SceneRenderState } from './scenes/registry'
import { seedFromString } from './prng'
import { layerPlanAt } from './composition'
import { resolveSceneColors } from './palettes'
import {
  transitionClipPath,
  transitionMaskAt,
  transitionProgress,
  type TransitionMask,
} from './transitions'

export type LayerRender = {
  layerId: string
  index: number
  name: string
  opacity: number
  plan: ScenePlan | null
  render: SceneRenderState | null
  mask: TransitionMask
  clipPath: string
}

export type CanvasRenderModel = {
  takeover: CanvasTakeover
  plan: ScenePlan | null
  render: SceneRenderState | null
  identify: CanvasIdentify | null
  layers: LayerRender[]
}

/**
 * One layer stack for one slot at one instant. `tMs` is wall time since
 * deployment, never a scene-local time, so every layer and frame shares the
 * same transition front. Scene state still uses `plan.sceneTimeMs`.
 */
export function layerRendersAt(
  album: DeploymentAlbum,
  albumSeed: number,
  tMs: number,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
): LayerRender[] {
  const kind = album.transition?.kind ?? 'none'
  const direction = album.transition?.direction ?? 'left'
  const progress = transitionProgress(album.transition, tMs)

  return layerPlanAt(album, albumSeed, tMs).map((planned) => {
    const render = planned.plan
      ? computeSceneState(resolveSceneColors(planned.plan.scene, album.palette), {
          bounds: { width: geometry.width, height: geometry.height },
          geometry,
          tMs: planned.plan.sceneTimeMs,
          seed: planned.plan.seed,
        })
      : null
    const mask = transitionMaskAt(kind, progress, slot, geometry, direction)
    return {
      ...planned,
      render,
      mask,
      clipPath: transitionClipPath(kind, mask, direction),
    }
  })
}

/**
 * Everything one display needs for one instant. `nowMs` is local time;
 * `clockOffsetMs` converts it to console time. Scene state uses no slot data;
 * only the transition mask does.
 */
export function canvasRenderModel(
  state: CanvasState | null,
  nowMs: number,
  clockOffsetMs = 0,
): CanvasRenderModel | null {
  if (!state) return null
  const synced = nowMs + clockOffsetMs
  const takeover = resolveCanvasTakeover(state, synced)
  if (!takeover) return null

  const { deployment, geometry, slot } = takeover
  const identify = state.identify && state.identify.until > synced ? state.identify : null
  const album = deployment.album
  const t = synced - deployment.effectiveAt
  const fallbackPlan = album
    ? sceneAt(album, seedFromString(album.id), t, album.crossfadeMs)
    : null

  const layers = album ? layerRendersAt(album, seedFromString(album.id), t, geometry, slot) : []
  const first = layers.find((layer) => layer.render) ?? layers[0] ?? null

  return {
    takeover,
    plan: first?.plan ?? fallbackPlan,
    render: first?.render ?? null,
    identify,
    layers,
  }
}
```

- [ ] **Step 5: Create `components/frame/canvas/canvas-layer-stack.tsx`**

```tsx
'use client'

import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { LayerRender } from '@/lib/canvas/render-model'
import { CanvasFrameScene, type CanvasElementRefs } from './canvas-frame-scene'

export function refsForLayer(
  store: Map<string, CanvasElementRefs>,
  layerId: string,
): CanvasElementRefs {
  let refs = store.get(layerId)
  if (!refs) {
    refs = new Map()
    store.set(layerId, refs)
  }
  return refs
}

export function CanvasLayerStack({
  layers,
  geometry,
  slot,
  refsByLayer,
}: {
  layers: LayerRender[]
  geometry: ResolvedGeometry
  slot: ResolvedSlot
  refsByLayer: Map<string, CanvasElementRefs>
}) {
  return (
    <>
      {layers.map((layer) => (
        layer.render ? (
          <div
            key={layer.layerId}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: layer.opacity * (layer.plan?.fade ?? 1),
              clipPath: layer.clipPath,
            }}
          >
            <CanvasFrameScene
              model={layer.render}
              geometry={geometry}
              slot={slot}
              refs={refsForLayer(refsByLayer, layer.layerId)}
            />
          </div>
        ) : null
      ))}
    </>
  )
}
```

Each layer owns its element-ref map so `paintScene` cannot write one layer's DOM styles into another. The stage keeps one map per layer; the preview nests one such map per slot.

- [ ] **Step 6: Update `components/frame/canvas/canvas-stage.tsx`**

Change the frame-scene imports to keep painting and drop the direct scene render:

```tsx
import { paintScene, type CanvasElementRefs } from './canvas-frame-scene'
import { CanvasLayerStack, refsForLayer } from './canvas-layer-stack'
```

Add `layerRendersAt` from the render model:

```tsx
import { layerRendersAt } from '@/lib/canvas/render-model'
```

Remove the phase-1 `sceneStateAt` import from `@/lib/canvas/scenes/registry`; the tick now computes full layer renders instead.

Replace the one refs map with one map per layer:

```tsx
  const refsByLayer = useRef(new Map<string, CanvasElementRefs>())
  const [layers, setLayers] = useState(() => model.layers)
```

In the existing `requestAnimationFrame` tick, keep the phase-1 `sceneAt` call for the marker state, then paint every layer. The wall time is `t`; the scene time stays inside each plan:

```tsx
      const plans = album && t >= 0 ? layerRendersAt(album, seed, Math.max(0, t), geometry, slot) : []

      if (plan && plan.scene.id !== scene?.id) {
        refsByLayer.current.clear()
        setScene(plan.scene)
        setLayers(plans)
      }

      for (const layer of plans) {
        if (!layer.render) continue
        paintScene(layer.render, geometry, slot, refsForLayer(refsByLayer.current, layer.layerId))
      }
```

Keep the existing fps accounting and effect dependencies unchanged.

Replace this exact phase-1 block:

```tsx
          {sceneView && (
            <div style={{ position: 'absolute', inset: 0, opacity: sceneView.fade }}>
              <CanvasFrameScene model={sceneView.render} geometry={geometry} slot={slot} refs={refs.current} />
            </div>
          )}
```

with:

```tsx
          {layers.length > 0 && (
            <CanvasLayerStack
              layers={layers}
              geometry={geometry}
              slot={slot}
              refsByLayer={refsByLayer.current}
            />
          )}
```

Delete the whole `sceneView` IIFE. `scene` remains only for `showMarker` and the scene-change check. `setLayers` is called only when the base scene changes, matching the existing render cadence while `paintScene` handles every frame.

- [ ] **Step 7: Update `components/editor/canvas-admin/wall-preview.tsx`**

Phase 2's preview computes one `plan` and one `SceneRenderState` called `model`, then loops over `geometry.slots`. Keep that loop and the `plan` useMemo for the status line. Change the frame-scene import to keep painting and the ref type:

```tsx
import { paintScene, type CanvasElementRefs } from '@/components/frame/canvas/canvas-frame-scene'
```

Replace the `computeSceneState` import with the layered helper, and add these imports:

```tsx
import { layerRendersAt } from '@/lib/canvas/render-model'
import { CanvasLayerStack, refsForLayer } from '@/components/frame/canvas/canvas-layer-stack'
```

Keep `CanvasFrameScene` out of the imports: `CanvasLayerStack` now renders one `CanvasFrameScene` per layer. Add a short comment above the stack so the preview's phase-2 source contract stays clear:

```tsx
                  {/* CanvasLayerStack renders CanvasFrameScene once per enabled layer. */}
```

Nest the refs maps by slot, then by layer. Replace `const refsBySlot = useRef(new Map<string, CanvasElementRefs>())` with:

```tsx
  const refsBySlot = useRef(new Map<string, Map<string, CanvasElementRefs>>())
```

Delete the old `model` useMemo and replace the old paint effect with one that paints every layer of every slot:

```tsx
  useEffect(() => {
    if (!album || consoleStart === null) return
    const seed = seedFromString(album.id)
    const t = Math.max(0, now - consoleStart)
    for (const slot of geometry.slots) {
      let slotRefs = refsBySlot.current.get(slot.slotId)
      if (!slotRefs) {
        slotRefs = new Map<string, CanvasElementRefs>()
        refsBySlot.current.set(slot.slotId, slotRefs)
      }
      for (const layer of layerRendersAt(album, seed, t, geometry, slot)) {
        if (!layer.render) continue
        paintScene(layer.render, geometry, slot, refsForLayer(slotRefs, layer.layerId))
      }
    }
  }, [album, consoleStart, now, geometry])
```

Inside the existing `geometry.slots.map((slot) => { ... })` loop, replace the line that declares `refs`:

```tsx
            const refs = refsBySlot.current.get(slot.slotId) ?? new Map<string, HTMLElement | null>()
```

with a slot-scoped map and the layers for that slot:

```tsx
            let slotRefs = refsBySlot.current.get(slot.slotId)
            if (!slotRefs) {
              slotRefs = new Map<string, CanvasElementRefs>()
              refsBySlot.current.set(slot.slotId, slotRefs)
            }
            const layers = album && consoleStart !== null
              ? layerRendersAt(
                  album,
                  seedFromString(album.id),
                  Math.max(0, now - consoleStart),
                  geometry,
                  slot,
                )
              : []
```

Replace the old `<CanvasFrameScene ... />` element inside that slot with:

```tsx
                  {/* CanvasLayerStack renders CanvasFrameScene once per enabled layer. */}
                  {layers.length > 0 && (
                    <CanvasLayerStack
                      layers={layers}
                      geometry={geometry}
                      slot={slot}
                      refsByLayer={slotRefs}
                    />
                  )}
```

`slot` is the loop variable and `layers` comes from that slot's render; there is no top-level `slot` or `model.layers` in this component. Do not call `canvasRenderModel` here.

- [ ] **Step 8: Run the tests and typecheck**

Run:
```bash
pnpm vitest run lib/canvas/__tests__/render-model-composition.test.ts tests/canvas-layer-stack.test.ts lib/canvas/__tests__/render-model.test.ts tests/canvas-display.test.ts
npx tsc --noEmit
```

Expected: PASS. The phase-1 render-model test still passes because `plan` and `render` remain available.

- [ ] **Step 9: Commit**

```bash
git add lib/canvas/render-model.ts components/frame/canvas/canvas-layer-stack.tsx components/frame/canvas/canvas-stage.tsx components/editor/canvas-admin/wall-preview.tsx lib/canvas/__tests__/render-model-composition.test.ts tests/canvas-layer-stack.test.ts
git commit -m "feat(canvas): render layers and wall masks on every frame"
```

---

### Task 7: Six upload-free starter shows

**Files:**
- Create: `lib/canvas/templates.ts`
- Test: `lib/canvas/__tests__/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/canvas/__tests__/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CanvasTemplateId } from '@/lib/types'
import { albumUpdateSchema, layoutInputSchema } from '@/lib/schema'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { CANVAS_TEMPLATES, templateDocuments } from '@/lib/canvas/templates'

const expected: { id: CanvasTemplateId; name: string; palette: string; transition: string }[] = [
  { id: 'hello-wall', name: 'Hello Wall', palette: 'candy', transition: 'wipe' },
  { id: 'sync-check', name: 'Sync Check', palette: 'mono', transition: 'chase' },
  { id: 'colour-study', name: 'Colour Study', palette: 'aurora', transition: 'iris' },
  { id: 'type-parade', name: 'Type Parade', palette: 'neon', transition: 'wipe' },
  { id: 'arcade-night', name: 'Arcade Night', palette: 'sunset', transition: 'chase' },
  { id: 'wall-clock', name: 'Wall Clock', palette: 'mono', transition: 'wipe' },
]

describe('canvas templates', () => {
  it('defines exactly the six starter shows', () => {
    expect(CANVAS_TEMPLATES.map((template) => template.id)).toEqual(expected.map((item) => item.id))
    expect(CANVAS_TEMPLATES.map((template) => template.name)).toEqual(expected.map((item) => item.name))
  })

  it('gives each show its declared palette and transition', () => {
    for (const item of expected) {
      const template = templateDocuments(item.id)
      expect(template.album.paletteId).toBe(item.palette)
      expect(template.album.transition.kind).toBe(item.transition)
    }
  })

  it('produces valid layout and album documents', () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(layoutInputSchema.safeParse(template.layout).success).toBe(true)
      expect(albumUpdateSchema.safeParse(template.album).success).toBe(true)
    }
  })

  it('paints catalog scenes with palette tokens', () => {
    let painted = 0
    for (const template of CANVAS_TEMPLATES) {
      for (const scene of template.album.scenes) {
        if (!(CATALOG_TYPES as readonly string[]).includes(scene.type)) continue
        const colors = (scene.config as { colors?: string[] }).colors
        expect(Array.isArray(colors)).toBe(true)
        expect(colors?.length).toBeGreaterThan(0)
        expect(colors?.every((color) => color.startsWith('palette:'))).toBe(true)
        painted += 1
      }
    }
    expect(painted).toBeGreaterThan(0)
  })

  it('needs no uploads or network assets', () => {
    for (const template of CANVAS_TEMPLATES) {
      const json = JSON.stringify(template)
      expect(json).not.toContain('/api/media')
      expect(json).not.toContain('/api/uploads')
      expect(json).not.toContain('data:image')
      expect(json).not.toContain('http://')
      expect(json).not.toContain('https://')
    }
  })

  it('uses unassigned slots, unique scene ids and one mirrored layer', () => {
    for (const template of CANVAS_TEMPLATES) {
      expect(template.layout.canvas.slots.length).toBeGreaterThan(0)
      for (const slot of template.layout.canvas.slots) expect(slot.frameId).toBeNull()
      const scenes = template.album.scenes
      expect(scenes.length).toBeGreaterThan(0)
      expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length)
      for (const scene of scenes) {
        expect(scene.enabled).toBe(true)
        expect(scene.durationSec).toBeGreaterThanOrEqual(5)
        expect(Number.isInteger(scene.seed)).toBe(true)
      }
      expect(template.album.layers).toHaveLength(1)
      expect(template.album.layers[0].scenes).toEqual(scenes)
    }
  })

  it('builds the same documents on every call', () => {
    for (const item of expected) {
      expect(templateDocuments(item.id)).toEqual(templateDocuments(item.id))
    }
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run lib/canvas/__tests__/templates.test.ts`

Expected: FAIL with "Cannot find module '@/lib/canvas/templates'".

- [ ] **Step 3: Implement `lib/canvas/templates.ts`**

```ts
import type {
  CanvasConfig,
  CanvasPaletteId,
  CanvasScene,
  CanvasSceneType,
  CanvasTemplate,
  CanvasTemplateId,
  CanvasTransitionDirection,
  CanvasTransitionKind,
  LayoutSettings,
} from '@/lib/types'
import { defaultSlideshow } from '@/lib/albums'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { coerceScene, defaultScene } from '@/lib/canvas/scenes/registry'

const SETTINGS: LayoutSettings = {
  resolution: '1080x1920',
  background: '',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

function canvas(count: number, gap: number): CanvasConfig {
  return {
    arrangement: 'row',
    gap,
    align: 'center',
    slots: Array.from({ length: count }, (_, index) => ({
      id: `slot-${index + 1}`,
      frameId: null,
      label: `Frame ${index + 1}`,
      offset: { x: 0, y: 0 },
      scale: 1,
    })),
    background: '#05070d',
    markers: 'identify',
    notifications: 'suppress',
    nightMode: 'inherit',
    maxFps: 30,
  }
}

type SceneSpec = { type: CanvasSceneType; id: string; name: string; seed: number; durationSec: number }

type TemplateSpec = {
  id: CanvasTemplateId
  name: string
  description: string
  paletteId: CanvasPaletteId
  gap: number
  slots: number
  transition: { kind: CanvasTransitionKind; durationMs: number; direction: CanvasTransitionDirection }
  scenes: SceneSpec[]
}

const SPECS: readonly TemplateSpec[] = [
  {
    id: 'hello-wall',
    name: 'Hello Wall',
    description: 'A greeting marquee followed by a sync check on two frames',
    paletteId: 'candy',
    gap: 0,
    slots: 2,
    transition: { kind: 'wipe', durationMs: 600, direction: 'left' },
    scenes: [
      { type: 'marquee', id: 'hello-marquee', name: 'Hello, wall', seed: 101, durationSec: 60 },
      { type: 'sync-test', id: 'hello-sync', name: 'Sync check', seed: 102, durationSec: 30 },
    ],
  },
  {
    id: 'sync-check',
    name: 'Sync Check',
    description: 'Three frames with a sweeping bar, grid and bezel markers',
    paletteId: 'mono',
    gap: 120,
    slots: 3,
    transition: { kind: 'chase', durationMs: 900, direction: 'left' },
    scenes: [
      { type: 'sync-test', id: 'check-sweep', name: 'Sweep', seed: 201, durationSec: 60 },
    ],
  },
  {
    id: 'colour-study',
    name: 'Colour Study',
    description: 'Slow gradients and moving colour fields across three frames',
    paletteId: 'aurora',
    gap: 0,
    slots: 3,
    transition: { kind: 'iris', durationMs: 800, direction: 'left' },
    scenes: [
      { type: 'gradient-flow', id: 'study-gradient', name: 'Gradient flow', seed: 301, durationSec: 120 },
      { type: 'color-field', id: 'study-field', name: 'Colour field', seed: 302, durationSec: 90 },
      { type: 'light-sweep', id: 'study-sweep', name: 'Light sweep', seed: 303, durationSec: 60 },
    ],
  },
  {
    id: 'type-parade',
    name: 'Type Parade',
    description: 'Kinetic type, split flaps, several lanes and a wall clock',
    paletteId: 'neon',
    gap: 0,
    slots: 3,
    transition: { kind: 'wipe', durationMs: 700, direction: 'up' },
    scenes: [
      { type: 'kinetic-type', id: 'type-kinetic', name: 'Kinetic type', seed: 401, durationSec: 60 },
      { type: 'split-flap', id: 'type-flap', name: 'Split flap', seed: 402, durationSec: 60 },
      { type: 'multi-lane-marquee', id: 'type-lanes', name: 'Many lanes', seed: 403, durationSec: 60 },
      { type: 'wall-clock', id: 'type-clock', name: 'Wall clock', seed: 404, durationSec: 60 },
    ],
  },
  {
    id: 'arcade-night',
    name: 'Arcade Night',
    description: 'Chasing lights and two built-in arcade games on two frames',
    paletteId: 'sunset',
    gap: 0,
    slots: 2,
    transition: { kind: 'chase', durationMs: 600, direction: 'right' },
    scenes: [
      { type: 'chase-lights', id: 'arcade-chase', name: 'Chase lights', seed: 501, durationSec: 45 },
      { type: 'snake', id: 'arcade-snake', name: 'Snake', seed: 502, durationSec: 90 },
      { type: 'breakout', id: 'arcade-breakout', name: 'Breakout', seed: 503, durationSec: 90 },
    ],
  },
  {
    id: 'wall-clock',
    name: 'Wall Clock',
    description: 'A large synced clock and countdown for a three-frame wall',
    paletteId: 'mono',
    gap: 0,
    slots: 3,
    transition: { kind: 'wipe', durationMs: 500, direction: 'left' },
    scenes: [
      { type: 'wall-clock', id: 'clock-time', name: 'Wall clock', seed: 601, durationSec: 120 },
      { type: 'countdown', id: 'clock-count', name: 'Countdown', seed: 602, durationSec: 120 },
    ],
  },
]

const CATALOG_PALETTE_CYCLE = ['palette:primary', 'palette:secondary', 'palette:accent', 'palette:text'] as const

function paint(scene: CanvasScene): CanvasScene {
  if (scene.type === 'marquee') {
    return {
      ...scene,
      config: {
        ...scene.config,
        style: { ...scene.config.style, color: 'palette:text', accent: 'palette:accent' },
      },
    }
  }
  if (scene.type === 'bounce') {
    return {
      ...scene,
      config: {
        ...scene.config,
        tint: {
          ...scene.config.tint,
          mode: 'cycle',
          colors: ['palette:primary', 'palette:secondary', 'palette:accent'],
          fixed: 'palette:text',
        },
      },
    }
  }
  if (scene.type === 'pong') {
    return {
      ...scene,
      config: {
        ...scene.config,
        colors: {
          ball: 'palette:text',
          paddles: 'palette:accent',
          net: 'palette:secondary',
          text: 'palette:text',
        },
      },
    }
  }
  if ((CATALOG_TYPES as readonly string[]).includes(scene.type)) {
    const config = scene.config as { colors?: string[] }
    const colors = Array.isArray(config.colors) && config.colors.length
      ? config.colors
      : ['#7cc4ff', '#e879f9', '#facc15', '#22c55e']
    return {
      ...scene,
      config: {
        ...config,
        colors: colors.map((_, index) => CATALOG_PALETTE_CYCLE[index % CATALOG_PALETTE_CYCLE.length]),
      },
    } as CanvasScene
  }
  return scene
}

function buildScene(spec: SceneSpec, config: CanvasConfig): CanvasScene {
  const geometry = resolveGeometry(config)
  const base = coerceScene(defaultScene(spec.type, geometry), config.arrangement, geometry)
  const fixed: CanvasScene = {
    ...base,
    id: spec.id,
    name: spec.name,
    enabled: true,
    durationSec: spec.durationSec,
    seed: spec.seed,
  }
  return paint(fixed)
}

/** Build a fresh template document. The result never depends on wall-clock time. */
export function templateDocuments(id: CanvasTemplateId): CanvasTemplate {
  const spec = SPECS.find((item) => item.id === id)
  if (!spec) throw new Error(`Unknown canvas template: ${id}`)
  const config = canvas(spec.slots, spec.gap)
  const scenes = spec.scenes.map((item) => buildScene(item, config))
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    layout: {
      name: spec.name,
      kind: 'canvas',
      widgets: [],
      canvas: config,
      settings: { ...SETTINGS },
    },
    album: {
      name: spec.name,
      theme: 'canvas',
      items: [],
      slideshow: defaultSlideshow('canvas'),
      scenes,
      layers: [{
        id: 'base',
        name: 'Base',
        enabled: true,
        scenes,
        order: 'sequence',
        crossfadeMs: 400,
      }],
      transition: { ...spec.transition },
      paletteId: spec.paletteId,
    },
  }
}

export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = SPECS.map((spec) => templateDocuments(spec.id))
```

- [ ] **Step 4: Run the tests**

Run:
```bash
pnpm vitest run lib/canvas/__tests__/templates.test.ts lib/canvas/__tests__/schema-composition.test.ts
```

Expected: PASS if phase 4 registered every catalog scene type. If a catalog default produces a `data:` or `http` asset, fix that phase-4 default; do not weaken this test.

- [ ] **Step 5: Commit**

```bash
git add lib/canvas/templates.ts lib/canvas/catalog-kit.ts lib/canvas/__tests__/templates.test.ts
git commit -m "feat(canvas): add six upload-free starter shows"
```

---

### Task 8: Create a show from a template in the Albums tab

**Files:**
- Create: `lib/canvas/template-service.ts`
- Create: `components/editor/canvas-admin/template-picker.tsx`
- Modify: `components/editor/canvas-admin/albums-tab.tsx`
- Test: `tests/canvas-template-service.test.ts`
- Test: `tests/canvas-composition-ui.test.ts` (first half)

- [ ] **Step 1: Write the failing service test**

Create `tests/canvas-template-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createCanvasTemplate } from '@/lib/canvas/template-service'

describe('createCanvasTemplate', () => {
  it('writes the album before the layout and points the layout at the album', async () => {
    const calls: string[] = []
    const client = {
      createAlbum: async (body: Record<string, unknown>) => {
        calls.push('album:create')
        expect(body).toEqual({ name: 'Hello Wall', theme: 'canvas' })
        return { id: 'album-99' }
      },
      updateAlbum: async (id: string, body: Record<string, unknown>) => {
        calls.push('album:update')
        expect(id).toBe('album-99')
        expect(body.scenes).toHaveLength(2)
        expect(body.layers).toHaveLength(1)
        expect(body.paletteId).toBe('candy')
      },
      createLayout: async (body: Record<string, unknown>) => {
        calls.push('layout:create')
        expect(body.settings).toMatchObject({ albumId: 'album-99' })
        expect(body.kind).toBe('canvas')
        return { id: 'layout-99' }
      },
    }
    const result = await createCanvasTemplate('hello-wall', client)
    expect(result).toEqual({ albumId: 'album-99', layoutId: 'layout-99' })
    expect(calls).toEqual(['album:create', 'album:update', 'layout:create'])
  })

  it('does not mutate the template catalogue', async () => {
    const client = {
      createAlbum: async () => ({ id: 'a' }),
      updateAlbum: async () => undefined,
      createLayout: async () => ({ id: 'l' }),
    }
    await createCanvasTemplate('wall-clock', client)
    await createCanvasTemplate('wall-clock', client)
    const { templateDocuments } = await import('@/lib/canvas/templates')
    expect(templateDocuments('wall-clock').layout.settings.albumId).toBeNull()
  })
})
```

- [ ] **Step 2: Write the failing UI test**

Create `tests/canvas-composition-ui.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates'

const root = path.resolve(__dirname, '..')
const picker = readFileSync(path.join(root, 'components/editor/canvas-admin/template-picker.tsx'), 'utf8')
const albums = readFileSync(path.join(root, 'components/editor/canvas-admin/albums-tab.tsx'), 'utf8')

describe('canvas template editor wiring', () => {
  it('offers a New from template button in the Albums tab', () => {
    expect(albums).toContain('New from template')
    expect(albums).toContain('<TemplatePicker')
    expect(albums).toContain('createCanvasTemplate(')
  })

  it('lists all six template names in the picker', () => {
    expect(CANVAS_TEMPLATES.map((template) => template.name)).toEqual([
      'Hello Wall', 'Sync Check', 'Colour Study', 'Type Parade', 'Arcade Night', 'Wall Clock',
    ])
    expect(picker).toContain('CANVAS_TEMPLATES')
  })
})
```

- [ ] **Step 3: Run both tests**

Run: `pnpm vitest run tests/canvas-template-service.test.ts tests/canvas-composition-ui.test.ts`

Expected: FAIL because the service and components do not exist.

- [ ] **Step 4: Implement `lib/canvas/template-service.ts`**

```ts
import type { CanvasTemplateId } from '@/lib/types'
import { templateDocuments } from './templates'

export type TemplateWriteClient = {
  createAlbum: (body: { name: string; theme: 'canvas' }) => Promise<{ id: string }>
  updateAlbum: (id: string, body: Record<string, unknown>) => Promise<void>
  createLayout: (body: Record<string, unknown>) => Promise<{ id: string }>
}

export type TemplateCreateResult = { albumId: string; layoutId: string }

/**
 * `POST /api/albums` only accepts albumCreateSchema (name and theme), so the
 * full canvas album is written with PUT to `/api/albums/<id>` next. The layout
 * is created last, after the album id is known.
 */
export async function createCanvasTemplate(
  templateId: CanvasTemplateId,
  client: TemplateWriteClient,
): Promise<TemplateCreateResult> {
  const template = templateDocuments(templateId)
  const album = await client.createAlbum({ name: template.album.name, theme: 'canvas' })
  await client.updateAlbum(album.id, { ...template.album })
  const layout = await client.createLayout({
    ...template.layout,
    settings: { ...template.layout.settings, albumId: album.id },
  })
  return { albumId: album.id, layoutId: layout.id }
}

async function write(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>): Promise<{ id: string }> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${url} failed: ${await response.text()}`)
  const data = (await response.json()) as { id?: unknown }
  if (typeof data.id !== 'string') throw new Error(`${method} ${url} did not return an id`)
  return { id: data.id }
}

export function consoleTemplateWriteClient(): TemplateWriteClient {
  return {
    createAlbum: (body) => write('/api/albums', 'POST', body),
    updateAlbum: async (id, body) => {
      await write(`/api/albums/${id}`, 'PUT', body)
    },
    createLayout: (body) => write('/api/layouts', 'POST', body),
  }
}
```

- [ ] **Step 5: Implement `components/editor/canvas-admin/template-picker.tsx`**

```tsx
'use client'

import type { CanvasTemplateId } from '@/lib/types'
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates'

export function TemplatePicker({
  onPick,
  onClose,
}: {
  onPick: (id: CanvasTemplateId) => void
  onClose: () => void
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-card p-3" role="group" aria-label="Starter shows">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Starter shows</h4>
        <button type="button" className="text-xs text-muted-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="grid gap-2">
        {CANVAS_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="w-full rounded border border-border px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => onPick(template.id)}
            >
              <span className="block font-medium">{template.name}</span>
              <span className="block text-xs text-muted-foreground">{template.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 6: Wire the button into `components/editor/canvas-admin/albums-tab.tsx`**

Add these imports:

```tsx
import { useState } from 'react'
import { mutate as revalidateAll } from 'swr'
import type { CanvasTemplateId } from '@/lib/types'
import { consoleTemplateWriteClient, createCanvasTemplate } from '@/lib/canvas/template-service'
import { TemplatePicker } from './template-picker'
```

If `useState` is already imported, merge it into the existing React import and add only the new symbols.

Inside the `AlbumsTab` component, add:

```tsx
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  const pickTemplate = async (id: CanvasTemplateId) => {
    setTemplateError(null)
    try {
      await createCanvasTemplate(id, consoleTemplateWriteClient())
      setTemplateOpen(false)
      await revalidateAll()
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'Could not create the starter show')
    }
  }
```

The global `revalidateAll` from `swr` refreshes every SWR key after the write, so this works regardless of which hook owns the albums list in phase 2. Add no second data hook.

In the header next to the existing **New album** button, add:

```tsx
        <button type="button" className="button-secondary" onClick={() => setTemplateOpen(true)}>
          New from template
        </button>
```

Immediately below the header, add:

```tsx
      {templateOpen && (
        <TemplatePicker onPick={(id) => void pickTemplate(id)} onClose={() => setTemplateOpen(false)} />
      )}
      {templateError && <p className="mt-2 text-sm text-red-500">{templateError}</p>}
```

- [ ] **Step 7: Run the tests and typecheck**

Run:
```bash
pnpm vitest run tests/canvas-template-service.test.ts
npx tsc --noEmit
```

Expected: PASS. Task 9 adds the options assertion to this UI test file.

- [ ] **Step 8: Commit**

```bash
git add lib/canvas/template-service.ts components/editor/canvas-admin/template-picker.tsx components/editor/canvas-admin/albums-tab.tsx tests/canvas-template-service.test.ts tests/canvas-composition-ui.test.ts
git commit -m "feat(canvas): create shows from starter templates"
```

---

### Task 9: Layer, transition and palette editor controls

**Files:**
- Create: `components/editor/canvas-admin/canvas-album-options.tsx`
- Modify: `components/editor/canvas-admin/album-editor.tsx`
- Modify: `tests/canvas-composition-ui.test.ts`

- [ ] **Step 1: Add the failing options assertion**

Append this block to `tests/canvas-composition-ui.test.ts`:

```ts
const options = readFileSync(path.join(root, 'components/editor/canvas-admin/canvas-album-options.tsx'), 'utf8')
const editor = readFileSync(path.join(root, 'components/editor/canvas-admin/album-editor.tsx'), 'utf8')

describe('canvas composition options', () => {
  it('exposes layer, transition and palette controls', () => {
    expect(options).toContain('CANVAS_PALETTES')
    expect(options).toContain('CANVAS_TRANSITION_KINDS')
    expect(options).toContain('Add layer')
    expect(options).toContain('syncCanvasAlbumLayers(')
  })

  it('routes album edits through the layer mirror', () => {
    expect(editor).toContain('syncCanvasAlbumLayers(')
    expect(editor).toContain('<CanvasAlbumOptions')
    expect(editor).not.toContain('onChange({ ...album')
  })
})
```

Run: `pnpm vitest run tests/canvas-composition-ui.test.ts`

Expected: FAIL because `canvas-album-options.tsx` does not exist.

- [ ] **Step 2: Add the options component**

Create `components/editor/canvas-admin/canvas-album-options.tsx`:

```tsx
'use client'

import type { CanvasAlbum, CanvasLayer, CanvasScene } from '@/lib/types'
import { CANVAS_TRANSITION_KINDS } from '@/lib/types'
import { CANVAS_PALETTES } from '@/lib/canvas/palettes'
import { syncCanvasAlbumLayers } from '@/lib/canvas/composition'
import { DEFAULT_STYLE } from '@/lib/widgets'

function newScene(type: 'sync-test' | 'marquee'): CanvasScene {
  if (type === 'sync-test') {
    return {
      id: `scene-${type}-${Date.now()}`,
      name: 'Sync test',
      enabled: true,
      durationSec: 30,
      seed: 1,
      type,
      config: { periodSec: 4, showGrid: true, showBezels: true },
    }
  }
  return {
    id: `scene-marquee-${Date.now()}`,
    name: 'Marquee',
    enabled: true,
    durationSec: 60,
    seed: 2,
    type: 'marquee',
    config: {
      lines: ['Type here'],
      layout: 'line',
      separator: '   •   ',
      direction: 'left',
      orientation: 'upright',
      speed: 240,
      repeat: true,
      gap: 600,
      lineHeight: 200,
      fontSize: 160,
      align: 'center',
      crossOffset: 0,
      style: { ...DEFAULT_STYLE, fontFamily: 'bebas', fontWeight: 700 },
    },
  }
}

export function CanvasAlbumOptions({
  album,
  onChange,
}: {
  album: CanvasAlbum
  onChange: (album: CanvasAlbum) => void
}) {
  const layers = album.layers?.length ? album.layers : [
    { id: 'base', name: 'Base', enabled: true, scenes: album.scenes, order: 'sequence', crossfadeMs: 400 } as CanvasLayer,
  ]
  const transition = album.transition ?? { kind: 'none' as const, durationMs: 0, direction: 'left' as const }

  const update = (patch: Partial<CanvasAlbum>) => {
    onChange(syncCanvasAlbumLayers({ ...album, ...patch }))
  }

  const updateLayer = (index: number, patch: Partial<CanvasLayer>) => {
    const next = layers.map((layer, position) => position === index ? { ...layer, ...patch } : layer)
    update({ layers: next })
  }

  return (
    <section className="grid gap-4 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">Composition</h3>

      <label className="grid gap-1 text-sm">
        Palette
        <select
          className="input"
          value={album.paletteId ?? ''}
          onChange={(event) => update({ paletteId: event.target.value ? event.target.value as CanvasAlbum['paletteId'] : undefined })}
        >
          <option value="">Built-in defaults</option>
          {CANVAS_PALETTES.map((palette) => (
            <option key={palette.id} value={palette.id}>{palette.name}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <label className="grid gap-1">
          Transition
          <select
            className="input"
            value={transition.kind}
            onChange={(event) => update({ transition: { ...transition, kind: event.target.value as NonNullable<CanvasAlbum['transition']>['kind'] } })}
          >
            {CANVAS_TRANSITION_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          Duration (ms)
          <input
            className="input"
            type="number"
            min={0}
            max={10000}
            step={100}
            value={transition.durationMs}
            onChange={(event) => update({ transition: { ...transition, durationMs: Number(event.target.value) } })}
          />
        </label>
        <label className="grid gap-1">
          Direction
          <select
            className="input"
            value={transition.direction}
            onChange={(event) => update({ transition: { ...transition, direction: event.target.value as NonNullable<CanvasAlbum['transition']>['direction'] } })}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </label>
      </div>

      <h4 className="text-sm font-medium">Layers</h4>
      {layers.map((layer, index) => (
        <div key={layer.id} className="grid gap-2 rounded border border-border p-3 text-sm">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={layer.enabled}
              onChange={(event) => updateLayer(index, { enabled: event.target.checked })}
              aria-label={`Enable ${layer.name}`}
            />
            <input
              className="input"
              value={layer.name}
              onChange={(event) => updateLayer(index, { name: event.target.value })}
              aria-label={`Name of layer ${index + 1}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">{layer.scenes.length} scene(s), {layer.order}, {layer.crossfadeMs} ms fade</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('sync-test')] })}>
              Add sync test
            </button>
            <button type="button" className="button-secondary" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('marquee')] })}>
              Add marquee
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={layer.scenes.length === 0}
              onClick={() => updateLayer(index, { scenes: layer.scenes.slice(0, -1) })}
            >
              Remove last scene
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="button-secondary"
        disabled={layers.length >= 3}
        onClick={() => update({
          layers: [...layers, {
            id: `layer-${layers.length + 1}`,
            name: `Layer ${layers.length + 1}`,
            enabled: true,
            scenes: [newScene('sync-test')],
            order: 'sequence',
            crossfadeMs: 400,
          }],
        })}
      >
        Add layer
      </button>
    </section>
  )
}
```

`Date.now()` here creates an authoring-time scene id in response to a click. It is not used in any state function, scheduler, scene state, template or transition mask.

- [ ] **Step 3: Wire the options into the album editor**

In `components/editor/canvas-admin/album-editor.tsx`, add:

```tsx
import type { CanvasAlbum } from '@/lib/types'
import { syncCanvasAlbumLayers } from '@/lib/canvas/composition'
import { CanvasAlbumOptions } from './canvas-album-options'
```

Inside `AlbumEditor`, add one setter and route every album edit through it:

```tsx
  function changeAlbum(next: Album) {
    const canvas = next as CanvasAlbum
    const layers = canvas.layers?.length
      ? canvas.layers.map((layer, index) => index === 0 ? { ...layer, scenes: canvas.scenes } : layer)
      : undefined
    onChange(syncCanvasAlbumLayers({ ...canvas, layers }) as Album)
  }
```

`syncCanvasAlbumLayers` treats layer zero as the source of truth, so the setter copies `next.scenes` into layer zero before syncing. Without that copy a scene form edit leaves `layers[0].scenes` stale and `albumUpdateSchema.superRefine` rejects Save.

Replace every `onChange({ ...album, ... })` in `AlbumEditor` with `changeAlbum({ ...album, ... })`: the album name field, scene order, crossfade, `updateScene`, `addScene` and scene deletion. Do not leave a direct `onChange` call on any album edit.

Insert the options immediately above `<section aria-label="Scenes">`:

```tsx
      <CanvasAlbumOptions album={album as CanvasAlbum} onChange={changeAlbum} />
```

`CanvasAlbumOptions` also calls `syncCanvasAlbumLayers` in its own `update`; the second call is idempotent. Pass the same `changeAlbum` setter to both, and add no second state setter.

- [ ] **Step 4: Run the UI test**

Run: `pnpm vitest run tests/canvas-composition-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/editor/canvas-admin/canvas-album-options.tsx components/editor/canvas-admin/album-editor.tsx tests/canvas-composition-ui.test.ts
git commit -m "feat(canvas): edit layers, palettes and transitions"
```

---

### Task 10: Phase 5 verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: PASS. Record the passed/skipped counts next to the preflight counts in the PR.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output.

- [ ] **Step 3: Build**

Run: `pnpm build`

Expected: the production build completes with no new warnings about client/server boundaries.

- [ ] **Step 4: Check the purity rules**

Run:
```bash
grep -R -n -E 'Math\.random|Date\.now\(|document\.|window\.' lib/canvas/composition.ts lib/canvas/palettes.ts lib/canvas/transitions.ts lib/canvas/templates.ts lib/canvas/render-model.ts
```

Expected: no lines from `composition.ts`, `palettes.ts`, `transitions.ts`, `templates.ts` or `render-model.ts`. `Date.now()` may appear only in `canvas-album-options.tsx`, which is a click handler in the editor. If a line appears in a state function, replace the value with an explicit input before continuing.

- [ ] **Step 5: Walk the operator flow**

Start the app against a scratch SQLite database:

```bash
FRAME_DB_PATH=.data/canvas-composition.db pnpm dev
```

Then:

1. Open the console, Canvas, Albums tab.
2. Press **New from template** and choose **Hello Wall**. Confirm a new canvas album and a new canvas layout appear, and that the layout's album selector points at the new album.
3. Open the album. Confirm one layer, palette `Candy`, transition `wipe` at 600 ms, a marquee scene and a sync-test scene.
4. Press **Add layer**, then **Add marquee** on the new layer. Confirm layer zero still mirrors `album.scenes` in the saved document.
5. Open the wall preview. Confirm the wipe advances at the same wall position on both frames and that the second layer is clipped with the same mask.
6. Deploy to two enrolled frames. Confirm the clock bar in Sync Check crosses both bezels at one wall position.

- [ ] **Step 6: Commit any fixes**

If a check fails, make the smallest change that keeps the phase boundary, rerun all three checks, and commit:

```bash
git add -A
git commit -m "fix(canvas): address phase 5 check failures"
```

---

## Phase 5 exit criteria

The phase is done when all of the following hold:

- `lib/canvas/composition.ts` composes one to three layers from the same synced timeline; one disabled layer is skipped; phase-1 albums still play through a single generated `base` layer.
- `lib/store.ts` mirrors `layers[0].scenes` into `scenes` and leaves pre-phase-5 scene arrays unchanged.
- `lib/canvas/transitions.ts` provides `wipe`, `iris` and `chase` masks with tests at progress 0, mid and 1, and the wall wipe front is identical for every slot at the same instant.
- `lib/canvas/palettes.ts` provides six upload-free palettes; `resolveSceneColors` replaces exact `palette:<token>` strings without mutating the scene.
- Deployment snapshots carry `layers`, `transition` and a resolved `palette`; the frame renderer and console wall preview both draw through `CanvasLayerStack`.
- The Albums tab offers **New from template** with exactly Hello Wall, Sync Check, Colour Study, Type Parade, Arcade Night and Wall Clock. Every generated document passes `layoutInputSchema` and `albumUpdateSchema` and references no uploads.
- No state function added in this phase uses `Math.random`, `Date.now`, DOM reads or a slot input. The only slot-aware code is the transition mask and the renderer that consumes it.
- `pnpm test`, `npx tsc --noEmit` and `pnpm build` all pass, and the operator walkthrough above completes.
