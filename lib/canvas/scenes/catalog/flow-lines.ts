import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function flowLinesState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 180, 0, 4000)
  const count = Math.min(16, Math.max(4, Math.round(configNumber(config, 'density', 12, 4, 16))))
  state.cells = Array.from({ length: count }, (_, index) => {
    const y = ((index + 0.5) * ctx.bounds.height) / count
    const x = fold(wave01(ctx.seed, index, 0) * ctx.bounds.width + (ctx.tMs / 1000) * speed, ctx.bounds.width)
    return {
      id: `flow:${index}`,
      x,
      y,
      w: ctx.bounds.width * 0.3,
      h: 2,
      value: wave01(ctx.seed, index, 1),
      color: colors[index % colors.length],
    }
  })
  return state
}
