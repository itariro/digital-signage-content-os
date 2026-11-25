import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function lissajousState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 12, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = 24
  state.cells = Array.from({ length: count }, (_, index) => {
    const t = (index / count) * Math.PI * 2 + state.phase * Math.PI * 2
    return {
      id: `lissajous:${index}`,
      x: ctx.bounds.width * (0.5 + 0.42 * Math.sin(3 * t)),
      y: ctx.bounds.height * (0.5 + 0.42 * Math.sin(2 * t)),
      w: 6,
      h: 6,
      value: index / count,
      color: colors[index % colors.length],
    }
  })
  return state
}
