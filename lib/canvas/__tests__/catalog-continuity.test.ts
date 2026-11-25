import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { computeSceneState, defaultScene } from '@/lib/canvas/scenes/registry'
import type { CanvasConfig } from '@/lib/types'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 120,
  align: 'center',
  bezelMode: 'show',
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
const ctx = (tMs: number) => ({
  bounds: { width: geometry.width, height: geometry.height },
  geometry,
  tMs,
  seed: 77,
})

describe('catalog wall continuity', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} draws the same commands at the same wall time`, () => {
      const scene = defaultScene(type, geometry)
      const first = computeSceneState(scene, ctx(19_240))
      computeSceneState(scene, ctx(2_000))
      computeSceneState(scene, ctx(86_400_000))
      const again = computeSceneState(scene, ctx(19_240))
      expect(again).toEqual(first)
      const commands = catalogDraw(first as Parameters<typeof catalogDraw>[0])
      expect(commands.length).toBeLessThanOrEqual(40)
      expect(catalogDraw(again as Parameters<typeof catalogDraw>[0])).toEqual(commands)
    })
  }
})
