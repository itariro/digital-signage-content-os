import type { CatalogContext, CatalogGameState, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, catalogGame, configColors, configNumber, gridCells, wave01 } from '@/lib/canvas/catalog-kit'

export function lifeState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const colors = configColors(config)
  const cols = Math.min(8, Math.max(2, Math.round(configNumber(config, 'cols', 8, 2, 8))))
  const rows = Math.min(4, Math.max(2, Math.round(configNumber(config, 'rows', 4, 2, 4))))
  const game = catalogGame(config, ctx, 'life',
    (seed): CatalogGameState => ({
      x: 0, y: 0, vx: 0, vy: 0, score: 0, stage: 0,
      cells: Array.from({ length: cols * rows }, (_, index) => wave01(seed, index, 0) > 0.5 ? 1 : 0),
    }),
    (previous) => {
      const cells = previous.cells.map((_, index) => {
        const x = index % cols
        const y = Math.floor(index / cols)
        let alive = 0
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue
            const nx = (x + dx + cols) % cols
            const ny = (y + dy + rows) % rows
            alive += previous.cells[ny * cols + nx] ?? 0
          }
        }
        const current = previous.cells[index] ?? 0
        return alive === 3 || (current === 1 && alive === 2) ? 1 : 0
      })
      return { ...previous, cells, score: cells.reduce<number>((sum, value) => sum + value, 0) }
    },
  )
  state.game = game
  state.cells = gridCells(ctx, cols, rows, 0).map((cell, index) => ({
    ...cell,
    id: `life:${cell.id}`,
    value: game.state.cells[index] ?? 0,
    color: colors[index % colors.length],
  }))
  return state
}
