import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function chaseLightsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 500, 0, 4000)
  const count = Math.min(32, Math.max(4, Math.round(configNumber(config, 'density', 16, 4, 32))))
  state.cells = Array.from({ length: count }, (_, index) => ({
    id: `chase:${index}`,
    x: fold((ctx.tMs / 1000) * speed + (index * ctx.bounds.width) / count, ctx.bounds.width),
    y: ctx.bounds.height / 2,
    w: Math.max(12, ctx.bounds.width / count / 3),
    h: Math.max(12, ctx.bounds.width / count / 3),
    value: (state.phase + index / count) % 1,
    color: colors[index % colors.length],
  }))
  return state
}
