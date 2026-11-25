import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function bouncingBallsState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const count = Math.min(16, Math.max(2, Math.round(configNumber(config, 'density', 6, 2, 16))))
  const size = configNumber(config, 'size', 28, 4, 600)
  const rx = Math.max(1, ctx.bounds.width - size)
  const ry = Math.max(1, ctx.bounds.height - size)
  state.cells = Array.from({ length: count }, (_, index) => {
    const speed = configNumber(config, 'speed', 300, 0, 4000) * (0.6 + wave01(ctx.seed, index, 0) * 0.8)
    const angle = wave01(ctx.seed, index, 1) * Math.PI * 2
    const x = fold(wave01(ctx.seed, index, 2) * rx + Math.cos(angle) * speed * ctx.tMs / 1000, rx)
    const y = fold(wave01(ctx.seed, index, 3) * ry + Math.sin(angle) * speed * ctx.tMs / 1000, ry)
    return {
      id: `ball:${index}`,
      x,
      y,
      w: size,
      h: size,
      value: wave01(ctx.seed, index, 4),
      color: colors[index % colors.length],
    }
  })
  return state
}
