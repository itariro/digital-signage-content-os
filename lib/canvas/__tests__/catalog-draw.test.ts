import { describe, expect, it } from 'vitest'
import { CATALOG_TYPES, type CatalogSceneRenderState } from '@/lib/canvas/catalog-kit'
import { catalogDraw } from '@/lib/canvas/catalog-draw'

const ref = `canvas-asset:${'a'.repeat(64)}`

function model(type: (typeof CATALOG_TYPES)[number]): CatalogSceneRenderState {
  return {
    type,
    config: { colors: ['#ff0000', '#00ff00'], images: [ref], text: 'WALL', lines: ['A', 'B'] },
    state: {
      tMs: 1000,
      cycleMs: 2000,
      phase: 0.5,
      values: [0.25, 0.75],
      texts: ['12:00:00'],
      images: [ref],
      cells: [{
        id: 'cell', x: 10, y: 20, w: 100, h: 60, value: 0.5,
        color: '#ff0000', text: 'A', image: ref,
      }],
    },
  }
}

describe('catalogDraw', () => {
  for (const type of CATALOG_TYPES) {
    it(`${type} emits at most 40 deterministic commands`, () => {
      const commands = catalogDraw(model(type))
      expect(commands.length).toBeGreaterThan(0)
      expect(commands.length).toBeLessThanOrEqual(40)
      expect(catalogDraw(model(type))).toEqual(commands)
    })
  }

  it('never emits a media URL', () => {
    expect(JSON.stringify(catalogDraw(model('panorama')))).not.toContain('/api/media')
    expect(JSON.stringify(catalogDraw(model('panorama')))).toContain('/api/canvas/assets/')
  })
})
