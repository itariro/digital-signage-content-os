import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function metaballsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 9, 0.5, 3600) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const count = Math.min(16, Math.max(3, Math.round(configNumber(config, 'density', 9, 3, 16))))
  const radius = Math.min(ctx.bounds.width, ctx.bounds.height) * 0.12
  state.cells = Array.from({ length: count }, (_, index) => {
    const a = wave01(ctx.seed, index, 0) * Math.PI * 2 + state.phase * Math.PI * 2
    const b = wave01(ctx.seed, index, 1) * Math.PI * 2 - state.phase * Math.PI * 2
    return {
      id: `meta:${index}`,
      x: ctx.bounds.width * (0.5 + 0.4 * Math.sin(a)),
      y: ctx.bounds.height * (0.5 + 0.4 * Math.cos(b)),
      w: radius * (1 + Math.sin(state.phase * Math.PI * 2 + index) * 0.3),
      h: radius * (1 + Math.cos(state.phase * Math.PI * 2 + index) * 0.3),
      value: (Math.sin(a + b) + 1) / 2,
      color: colors[index % colors.length],
    }
  })
  return state
}
