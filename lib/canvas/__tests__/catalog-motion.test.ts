import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { flowLinesState } from '@/lib/canvas/scenes/catalog/flow-lines'
import { lissajousState } from '@/lib/canvas/scenes/catalog/lissajous'
import { metaballsState } from '@/lib/canvas/scenes/catalog/metaballs'
import { moireState } from '@/lib/canvas/scenes/catalog/moire'
import { ripplesState } from '@/lib/canvas/scenes/catalog/ripples'

const ctx: CatalogContext = {
  bounds: { width: 2400, height: 1200 },
  geometry: { width: 2400, height: 1200 },
  tMs: 7333,
  seed: 21,
}
const config: CatalogSceneConfig = { density: 12, speed: 240, periodSec: 4 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['ripples', ripplesState],
  ['metaballs', metaballsState],
  ['lissajous', lissajousState],
  ['flow-lines', flowLinesState],
  ['moire', moireState],
]

describe('motion catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
      expect(a.cells.every((cell) => Number.isFinite(cell.x) && Number.isFinite(cell.y))).toBe(true)
    })
  }
})
