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
