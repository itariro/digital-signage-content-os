import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configImages, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function spriteParadeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const images = configImages(config)
  const count = Math.min(8, Math.max(2, Math.round(configNumber(config, 'density', 6, 2, 8))))
  const game = catalogGame(config, ctx, 'sprite-parade',
    (seed) => ({
      x: 0, y: 0, vx: 8, vy: 0, score: 0, stage: 0,
      cells: Array.from({ length: count }, (_, index) => Math.floor(wave01(seed, index, 0) * ctx.bounds.height)),
    }),
    (previous) => ({
      ...previous,
      x: previous.x + previous.vx,
      cells: previous.cells.map((y, index) => (y + 2 + index) % Math.max(1, ctx.bounds.height)),
    }),
  )
  state.game = game
  const size = configNumber(config, 'size', 90, 16, 600)
  state.cells = game.state.cells.map((y, index) => ({
    id: `sprite:${index}`,
    x: (game.state.x + index * (ctx.bounds.width / count)) % ctx.bounds.width,
    y,
    w: size,
    h: size,
    value: index / count,
    image: images[index % Math.max(1, images.length)],
  }))
  return state
}
