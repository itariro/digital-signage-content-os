import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function breakoutState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const size = configNumber(config, 'size', 24, 4, 200)
  const { width, height } = ctx.bounds
  const game = catalogGame(config, ctx, 'breakout',
    (seed) => ({
      x: Math.abs(seed) % Math.max(1, width - size),
      y: Math.abs(seed >> 3) % Math.max(1, height / 2),
      vx: 6 + (Math.abs(seed) % 4),
      vy: 5 + (Math.abs(seed >> 5) % 3),
      score: 0,
      stage: 0,
      cells: [],
    }),
    (previous, _tick, random) => {
      let vx = previous.vx
      let vy = previous.vy
      let x = previous.x + vx
      let y = previous.y + vy
      if (x <= 0 || x + size >= width) { vx = -vx; x = Math.max(0, Math.min(width - size, x)) }
      if (y <= 0 || y + size >= height) { vy = -vy; y = Math.max(0, Math.min(height - size, y)) }
      const paddle = Math.floor(random() * Math.max(1, width - size * 4))
      return { x, y, vx, vy, score: previous.score + (y <= 0 ? 1 : 0), stage: previous.stage, cells: [paddle] }
    },
  )
  state.game = game
  const paddleX = game.state.cells[0] ?? 0
  state.cells = [
    { id: 'breakout:ball', x: game.state.x, y: game.state.y, w: size, h: size, value: game.tick / 600, color: colors[0] },
    { id: 'breakout:paddle', x: paddleX, y: height - size * 2, w: size * 4, h: size, value: 0, color: colors[1] },
  ]
  return state
}
