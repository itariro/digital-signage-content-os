import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function lightSweepState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 600, 0, 4000)
  const colors = configColors(config)
  const x = fold((ctx.tMs / 1000) * speed + ctx.seed, ctx.bounds.width)
  const band = Math.max(20, ctx.bounds.width * 0.08)
  state.cells = [{
    id: 'sweep:front',
    x,
    y: 0,
    w: band,
    h: ctx.bounds.height,
    value: x / Math.max(1, ctx.bounds.width),
    color: colors[0],
  }]
  state.values = [state.cells[0].value, 1 - state.cells[0].value]
  return state
}
