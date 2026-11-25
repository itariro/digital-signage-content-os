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
