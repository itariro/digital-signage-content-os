import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { breakoutState } from '@/lib/canvas/scenes/catalog/breakout'
import { calibrationState } from '@/lib/canvas/scenes/catalog/calibration'
import { chaseLightsState } from '@/lib/canvas/scenes/catalog/chase-lights'
import { lifeState } from '@/lib/canvas/scenes/catalog/life'
import { snakeState } from '@/lib/canvas/scenes/catalog/snake'
import { spriteParadeState } from '@/lib/canvas/scenes/catalog/sprite-parade'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1500 },
  geometry: { width: 3000, height: 1500 },
  tMs: 47_000,
  seed: 41,
}
const config: CatalogSceneConfig = { speed: 30, density: 16, cols: 8, rows: 4 }
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['chase-lights', chaseLightsState],
  ['breakout', breakoutState],
  ['snake', snakeState],
  ['sprite-parade', spriteParadeState],
  ['life', lifeState],
  ['calibration', calibrationState],
]

describe('arcade and setup catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('replays games from round start', () => {
    for (const stateAt of [breakoutState, snakeState, spriteParadeState, lifeState]) {
      const late = stateAt(config, ctx)
      stateAt(config, { ...ctx, tMs: 1000 })
      expect(stateAt(config, ctx)).toEqual(late)
      expect(late.game).toBeDefined()
    }
  })

  it('uses the shared game replay engine', () => {
    for (const name of ['breakout', 'snake', 'sprite-parade', 'life']) {
      const source = readFileSync(path.join(process.cwd(), `lib/canvas/scenes/catalog/${name}.ts`), 'utf8')
      expect(source, name).toContain('catalogGame(')
    }
  })
})
