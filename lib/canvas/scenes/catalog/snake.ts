import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber } from '@/lib/canvas/catalog-kit'

export function snakeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const cols = Math.min(24, Math.max(8, Math.round(configNumber(config, 'cols', 16, 8, 24))))
  const rows = Math.min(16, Math.max(6, Math.round(configNumber(config, 'rows', 10, 6, 16))))
  const cellW = ctx.bounds.width / cols
  const cellH = ctx.bounds.height / rows
  const game = catalogGame(config, ctx, 'snake',
    () => ({ x: 4, y: 4, vx: 1, vy: 0, score: 0, stage: 0, cells: [4, 4] }),
    (previous, _tick, random) => {
      let vx = previous.vx
      let vy = previous.vy
      if (random() < 0.2) { vx = -vy; vy = previous.vx }
      const x = (previous.cells[0] + vx + cols) % cols
      const y = (previous.cells[1] + vy + rows) % rows
      return { x, y, vx, vy, score: previous.score + 1, stage: previous.stage, cells: [x, y, ...previous.cells].slice(0, 16) }
    },
  )
  state.game = game
  const flat = game.state.cells
  state.cells = []
  for (let index = 0; index + 1 < flat.length; index += 2) {
    state.cells.push({
      id: `snake:${index / 2}`,
      x: flat[index] * cellW,
      y: flat[index + 1] * cellH,
      w: cellW,
      h: cellH,
      value: index / Math.max(2, flat.length),
      color: colors[(index / 2) % colors.length],
    })
  }
  return state
}
