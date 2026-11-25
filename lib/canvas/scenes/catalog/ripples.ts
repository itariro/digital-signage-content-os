import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber } from '@/lib/canvas/catalog-kit'

export function ripplesState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const count = Math.min(16, Math.max(2, Math.round(configNumber(config, 'density', 8, 2, 16))))
  const maxRadius = Math.min(ctx.bounds.width, ctx.bounds.height) * 0.45
  state.cells = Array.from({ length: count }, (_, index) => {
    const value = (state.phase + index / count) % 1
    const radius = value * maxRadius
    return {
      id: `ripple:${index}`,
      x: ctx.bounds.width / 2 - radius,
      y: ctx.bounds.height / 2 - radius,
      w: radius * 2,
      h: radius * 2,
      value,
    }
  })
  return state
}
