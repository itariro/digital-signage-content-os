import { describe, expect, it } from 'vitest'
import { albumUpdateSchema, layoutInputSchema } from '@/lib/schema'
import { DEFAULT_STYLE } from '@/lib/widgets'
import { canvasConfigSchema, canvasSceneSchema, canvasStateSchema } from '@/lib/canvas/schema'

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

// Canvas slideshow is inline (not defaultSlideshow) so this schema suite does
// not depend on the album defaults added by a later task.
const canvasSlideshow = {
  presentation: 'canvas' as const,
  transition: 'none' as const,
  kenBurns: false,
  interval: 30,
  order: 'sequence' as const,
  artSize: 74,
  artPosition: 'center' as const,
  backdrop: 'blur' as const,
  backdropColor: '#14161b',
  canvas: { crossfadeMs: 400 },
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

describe('canvas deployment schema', () => {
  it('requires the deployment slot to exist in the config', () => {
    const deployment = {
      canvasId: 'wall', name: 'Wall', revision: 1, effectiveAt: 0, releaseAt: null,
      slotId: 'missing', config,
      album: { id: 'album', name: 'Album', scenes: [scenes['sync-test']], order: 'sequence' as const, crossfadeMs: 400 },
    }
    const state = { v: 1 as const, active: deployment, pending: null, identify: null }
    expect(canvasStateSchema.safeParse(state).success).toBe(false)
    expect(canvasStateSchema.safeParse({ ...state, active: { ...deployment, slotId: 'a' } }).success).toBe(true)
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
      slideshow: { ...canvasSlideshow },
    }
    expect(albumUpdateSchema.safeParse(base).success).toBe(false)

    const scene = scenes['sync-test']
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene] }).success).toBe(true)
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene], items: [{ id: 'x', image: '/x.png', sourceUrl: '', title: 'x', subtitle: '', year: '' }] }).success).toBe(false)
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene], slideshow: { ...base.slideshow, transition: 'fade' } }).success).toBe(false)
  })

  it('rejects scenes on a non-canvas album', () => {
    const scene = scenes['sync-test']
    const base = { name: 'Photos', theme: 'photos' as const, items: [], slideshow: { ...canvasSlideshow, presentation: 'fill' as const, transition: 'fade' as const } }
    expect(albumUpdateSchema.safeParse({ ...base, scenes: [scene] }).success).toBe(false)
  })
})
