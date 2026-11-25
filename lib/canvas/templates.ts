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
