import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function calibrationState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  state.cells = gridCells(ctx, 8, 4, 0).map((cell, index) => ({
    ...cell,
    id: `calibration:${cell.id}`,
    value: index === 0 ? 1 : 0,
    color: colors[index % colors.length],
  }))
  state.texts = [`${Math.round(ctx.bounds.width)} × ${Math.round(ctx.bounds.height)} cpx`]
  state.values = [configNumber(config, 'opacity', 1, 0.05, 1)]
  return state
}
