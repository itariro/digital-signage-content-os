import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function starfieldState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 40, 0, 4000)
  const count = Math.min(32, Math.max(8, Math.round(configNumber(config, 'density', 24, 8, 32))))
  state.cells = Array.from({ length: count }, (_, index) => {
    const x0 = wave01(ctx.seed, index, 0) * ctx.bounds.width
    const y0 = wave01(ctx.seed, index, 1) * ctx.bounds.height
    const size = 2 + wave01(ctx.seed, index, 2) * 6
    return {
      id: `star:${index}`,
      x: x0,
      y: fold(y0 + (ctx.tMs / 1000) * speed * (0.4 + wave01(ctx.seed, index, 3)), ctx.bounds.height),
      w: size,
      h: size,
      value: wave01(ctx.seed, index, 4),
    }
  })
  return state
}
