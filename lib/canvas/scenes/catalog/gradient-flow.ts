import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function gradientFlowState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 8, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 12
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `gradient:${index}`,
    x: 0,
    y: (index * ctx.bounds.height) / count,
    w: ctx.bounds.width,
    h: ctx.bounds.height / count,
    value: (Math.sin(state.phase * Math.PI * 2 + index * 0.6) + 1) / 2,
    color: colors[index % colors.length],
  }))
  state.values = state.cells.map((cell) => cell.value)
  return state
}
