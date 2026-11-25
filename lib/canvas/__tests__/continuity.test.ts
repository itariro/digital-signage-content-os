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
