import type { CatalogContext, CatalogSceneConfig, CatalogState } from '@/lib/canvas/catalog-kit'
import { baseState, configNumber } from '@/lib/canvas/catalog-kit'

function hms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
}

export function wallClockState(config: CatalogSceneConfig, ctx: CatalogContext): CatalogState {
  const state = baseState(config, ctx, 1000)
  const epochMs = configNumber(config, 'epochMs', 0, 0, 8.64e15)
  state.texts = [hms(epochMs + ctx.tMs)]
  return state
}
