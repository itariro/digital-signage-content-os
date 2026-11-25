import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function galleryWallState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 12, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const images = configImages(config)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(1, Math.round(configNumber(config, 'cols', 3, 1, 8))))
  const rows = Math.min(8, Math.max(1, Math.round(configNumber(config, 'rows', 2, 1, 8))))
  const gap = configNumber(config, 'gap', 12, 0, 2000)
  state.cells = gridCells(ctx, cols, rows, gap).map((cell, index) => ({
    ...cell,
    id: `gallery:${cell.id}`,
    value: (cell.value + state.phase) % 1,
    image: images[index % Math.max(1, images.length)],
    color: colors[index % colors.length],
  }))
  return state
}
