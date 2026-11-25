import { fold } from '@/lib/canvas/math'
import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configLines, configNumber } from '@/lib/canvas/catalog-kit'

export function multiLaneMarqueeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const speed = configNumber(config, 'speed', 240, 0, 4000)
  const lines = configLines(config, ['Hello, wall']).slice(0, 8)
  state.texts = lines
  state.cells = lines.map((text, index) => ({
    id: `lane:${index}`,
    x: fold(ctx.tMs / 1000 * speed + index * 800, ctx.bounds.width),
    y: (index + 0.5) * (ctx.bounds.height / lines.length),
    w: ctx.bounds.width,
    h: ctx.bounds.height / lines.length,
    value: (state.phase + index / lines.length) % 1,
    text,
  }))
  return state
}
