import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { colorFieldState } from '@/lib/canvas/scenes/catalog/color-field'
import { gradientFlowState } from '@/lib/canvas/scenes/catalog/gradient-flow'
import { lightSweepState } from '@/lib/canvas/scenes/catalog/light-sweep'

const ctx: CatalogContext = {
  bounds: { width: 2400, height: 1200 },
  geometry: { width: 2400, height: 1200 },
  tMs: 4200,
  seed: 12,
}
const config: CatalogSceneConfig = { colors: ['#ff0000', '#00ff00', '#0000ff'], periodSec: 5, speed: 300 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['gradient-flow', gradientFlowState],
  ['color-field', colorFieldState],
  ['light-sweep', lightSweepState],
]

describe('colour catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
      expect(a.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
    })
  }
})
