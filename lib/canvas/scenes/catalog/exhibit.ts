import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configImages, configLines, configNumber } from '@/lib/canvas/catalog-kit'

export function exhibitState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 6, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const scale = configNumber(config, 'scale', 0.6, 0.1, 1)
  const w = ctx.bounds.width * scale
  const h = ctx.bounds.height * scale
  state.cells = [{
    id: 'exhibit:main',
    x: (ctx.bounds.width - w) / 2,
    y: (ctx.bounds.height - h) / 2,
    w,
    h,
    value: state.phase,
    image: configImages(config)[0],
  }]
  state.texts = configLines(config, ['Exhibit']).slice(0, 4)
  return state
}
