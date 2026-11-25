import { clampReveal, revealAt } from '@/lib/reveal'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configImages, configNumber, gridCells } from '@/lib/canvas/catalog-kit'

export function tileRevealState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const intervalSec = configNumber(config, 'periodSec', 2, 0.5, 60)
  const state = baseState(config, ctx, intervalSec * 1000)
  const settings = clampReveal({
    tilesAcross: configNumber(config, 'cols', 5, 2, 10),
    tilesDown: configNumber(config, 'rows', 4, 2, 10),
    gap: configNumber(config, 'gap', 2, 0, 12),
    group: 'single',
    effect: 'fade',
  })
  const images = configImages(config)
  const colors = configColors(config)
  const reveal = revealAt({
    nowMs: ctx.tMs,
    offset: 0,
    seed: ctx.seed,
    intervalSec,
    itemCount: Math.max(1, images.length || colors.length),
    cols: settings.tilesAcross,
    rows: settings.tilesDown,
    group: settings.group,
  })
  state.cells = gridCells(ctx, settings.tilesAcross, settings.tilesDown, settings.gap).map((cell, index) => {
    const cellState = reveal.cells[index]
    const item = cellState?.item ?? index
    return {
      ...cell,
      id: `reveal:${index}`,
      value: cellState?.progress ?? 0,
      image: images[item % Math.max(1, images.length)],
      color: colors[item % colors.length],
    }
  })
  return state
}
