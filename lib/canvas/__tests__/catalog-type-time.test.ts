import { describe, expect, it } from 'vitest'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { countdownState } from '@/lib/canvas/scenes/catalog/countdown'
import { kineticTypeState } from '@/lib/canvas/scenes/catalog/kinetic-type'
import { multiLaneMarqueeState } from '@/lib/canvas/scenes/catalog/multi-lane-marquee'
import { splitFlapState } from '@/lib/canvas/scenes/catalog/split-flap'
import { wallClockState } from '@/lib/canvas/scenes/catalog/wall-clock'

const ctx: CatalogContext = {
  bounds: { width: 3000, height: 1000 },
  geometry: { width: 3000, height: 1000 },
  tMs: 3661_000,
  seed: 3,
}
const config: CatalogSceneConfig = {
  text: 'HELLO WALL',
  lines: ['ONE', 'TWO', 'THREE'],
  periodSec: 4,
  speed: 240,
}
const cases: Array<[string, (config: CatalogSceneConfig, ctx: CatalogContext) => CatalogState]> = [
  ['kinetic-type', kineticTypeState],
  ['split-flap', splitFlapState],
  ['multi-lane-marquee', multiLaneMarqueeState],
  ['wall-clock', wallClockState],
  ['countdown', countdownState],
]

describe('type and time catalog states', () => {
  for (const [name, stateAt] of cases) {
    it(`${name} is deterministic and bounded`, () => {
      const a = stateAt(config, ctx)
      expect(stateAt(config, ctx)).toEqual(a)
      expect(a.cells.length).toBeLessThanOrEqual(32)
    })
  }

  it('formats an epoch-based wall clock without reading the system clock', () => {
    const state = wallClockState({ ...config, epochMs: 0 }, ctx)
    expect(state.texts[0]).toBe('01:01:01')
  })

  it('clamps a countdown at zero', () => {
    const state = countdownState({ ...config, remainingMs: 60_000 }, ctx)
    expect(state.texts[0]).toBe('00:00:00')
  })
})
