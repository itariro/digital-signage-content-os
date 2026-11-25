import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { bouncingBallsState } from '@/lib/canvas/scenes/catalog/bouncing-balls'
import { fireworksState } from '@/lib/canvas/scenes/catalog/fireworks'
import { matrixRainState } from '@/lib/canvas/scenes/catalog/matrix-rain'
import { starfieldState } from '@/lib/canvas/scenes/catalog/starfield'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1200 },
  geometry: { width: 3000, height: 1200 },
  tMs: 9100,
  seed: 33,
}
const config: CatalogSceneConfig = { density: 24, speed: 300, periodSec: 3 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['starfield', starfieldState],
  ['matrix-rain', matrixRainState],
  ['fireworks', fireworksState],
  ['bouncing-balls', bouncingBallsState],
]

describe('particle catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('keeps balls inside the wall bounds', () => {
    const state = bouncingBallsState(config, ctx)
    for (const cell of state.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(0)
      expect(cell.y).toBeGreaterThanOrEqual(0)
      expect(cell.x + cell.w).toBeLessThanOrEqual(ctx.bounds.width + 1)
      expect(cell.y + cell.h).toBeLessThanOrEqual(ctx.bounds.height + 1)
    }
  })
})
