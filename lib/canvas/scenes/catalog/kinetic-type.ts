import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, configText } from '@/lib/canvas/catalog-kit'

export function kineticTypeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 4, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const text = configText(config, 'text', 'WALL', 200)
  const count = Math.min(8, Math.max(1, text.length))
  const width = ctx.bounds.width / count
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `kinetic:${index}`,
    x: index * width,
    y: Math.sin((state.phase + index / count) * Math.PI * 2) * ctx.bounds.height * 0.12,
    w: width,
    h: ctx.bounds.height,
    value: (state.phase + index / count) % 1,
    text: text[index],
  }))
  return state
}
