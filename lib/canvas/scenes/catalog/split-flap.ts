import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, configText, gridCells } from '@/lib/canvas/catalog-kit'

export function splitFlapState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const text = configText(config, 'text', 'WALL', 32)
  const chars = text.replace(/\s+/g, ' ').split('')
  const cols = Math.min(16, Math.max(1, chars.length))
  state.cells = gridCells(ctx, cols, 1, 0).map((cell, index) => ({
    ...cell,
    id: `flap:${index}`,
    value: (cell.value + state.phase) % 1,
    text: chars[index] ?? ' ',
  }))
  return state
}
