import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configColors, configNumber, wave01 } from '@/lib/canvas/catalog-kit'

export function fireworksState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const cycleMs = configNumber(config, 'periodSec', 3, 0.5, 60) * 1000
  const state = baseState(config, ctx, cycleMs)
  const colors = configColors(config)
  const bursts = 4
  const perBurst = 7
  state.cells = Array.from({ length: bursts * perBurst }, (_, index) => {
    const burst = Math.floor(index / perBurst)
    const particle = index % perBurst
    const angle = (particle / perBurst) * Math.PI * 2 + wave01(ctx.seed, burst, 0) * Math.PI
    const radius = state.phase * Math.min(ctx.bounds.width, ctx.bounds.height) * 0.22
    return {
      id: `firework:${burst}:${particle}`,
      x: ctx.bounds.width * wave01(ctx.seed, burst, 1) + Math.cos(angle) * radius,
      y: ctx.bounds.height * wave01(ctx.seed, burst, 2) + Math.sin(angle) * radius,
      w: 8 * (1 - state.phase * 0.5),
      h: 8 * (1 - state.phase * 0.5),
      value: 1 - state.phase,
      color: colors[burst % colors.length],
    }
  })
  return state
}
