import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

export function colorFieldState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 10, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(2, Math.round(configNumber(config, 'cols', 6, 2, 8))))
  const rows = Math.min(6, Math.max(2, Math.round(configNumber(config, 'rows', 4, 2, 6))))
  const gap = configNumber(config, 'gap', 4, 0, 2000)
  state.cells = gridCells(ctx, cols, rows, gap).map((cell, index) => {
    const raw = wave01(ctx.seed, index, Math.floor(ctx.tMs / cycleMs))
    const value = (raw + Math.sin(state.phase * Math.PI * 2 + index)) / 2
    return { ...cell, id: `field:${cell.id}`, value: Math.min(1, Math.max(0, value)), color: colors[index % colors.length] }
  })
  state.values = state.cells.map((cell) => cell.value)
  return state
}
