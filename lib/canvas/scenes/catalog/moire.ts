import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function moireState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 16, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 24
  const step = Math.min(ctx.bounds.width, ctx.bounds.height) / 28
  state.cells = Array.from({ length: count }, (_, index) => {
    const radius = step * (index + 1)
    const cx = ctx.bounds.width / 2 + Math.sin(state.phase * Math.PI * 2) * step
    const cy = ctx.bounds.height / 2
    return {
      id: `moire:${index}`,
      x: cx - radius,
      y: cy - radius,
      w: radius * 2,
      h: radius * 2,
      value: index / count,
      color: colors[index % colors.length],
    }
  })
  return state
}
