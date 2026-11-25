import { mosaicAt, mosaicGrid } from '@/lib/mosaic'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function mosaicWallState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const intervalSec = configNumber(config, 'periodSec', 1.5, 0.5, 60)
  const state = baseState(config, ctx, intervalSec * 1000)
  const images = configImages(config)
  const colors = configColors(config)
  const itemCount = Math.max(1, images.length || colors.length)
  const grid = mosaicGrid({
    width: ctx.bounds.width,
    height: ctx.bounds.height,
    tileAspect: 1.4,
    tilesAcross: Math.round(configNumber(config, 'cols', 5, 1, 8)),
    itemCount,
  })
  const cols = Math.min(8, Math.max(1, grid.cols))
  const rows = Math.min(8, Math.max(1, grid.rows))
  const mosaic = mosaicAt({
    nowMs: ctx.tMs,
    offset: 0,
    seed: ctx.seed,
    itemCount,
    intervalSec,
    cols,
    rows,
  })
  state.cells = gridCells(ctx, cols, rows, 0).map((cell, index) => {
    const tile = mosaic.tiles[index]
    const item = tile?.item ?? index
    return {
      ...cell,
      id: `mosaic:${index}`,
      value: tile?.progress ?? 0,
      image: images[item % Math.max(1, images.length)],
      color: colors[item % colors.length],
    }
  })
  return state
}
