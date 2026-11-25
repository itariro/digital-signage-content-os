import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configImages, configNumber } from '@/lib/canvas/catalog-kit'

export function panoramaState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 8, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const images = configImages(config)
  const count = Math.max(1, images.length)
  const width = ctx.bounds.width / count
  state.cells = images.length
    ? images.slice(0, 32).map((image, index) => ({
        id: `panorama:${index}`,
        x: index * width,
        y: 0,
        w: width,
        h: ctx.bounds.height,
        value: (state.phase + index / count) % 1,
        image,
      }))
    : [{ id: 'panorama:0', x: 0, y: 0, w: ctx.bounds.width, h: ctx.bounds.height, value: state.phase }]
  return state
}
