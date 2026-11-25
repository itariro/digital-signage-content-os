import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

const GLYPHS = 'アイウエオカキクケコ0123456789'

export function matrixRainState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const speed = configNumber(config, 'speed', 320, 0, 4000)
  const count = Math.min(16, Math.max(4, Math.round(configNumber(config, 'density', 12, 4, 16))))
  const columnWidth = ctx.bounds.width / count
  state.cells = Array.from({ length: count }, (_, index) => {
    const drop = fold(wave01(ctx.seed, index, 0) * ctx.bounds.height + (ctx.tMs / 1000) * speed, ctx.bounds.height + 200) - 100
    const glyph = Math.floor(wave01(ctx.seed, index, Math.floor(ctx.tMs / 120)) * GLYPHS.length)
    return {
      id: `rain:${index}`,
      x: index * columnWidth,
      y: drop,
      w: columnWidth,
      h: 40,
      value: wave01(ctx.seed, index, 9),
      color: colors[index % colors.length],
      text: GLYPHS[glyph],
    }
  })
  return state
}
