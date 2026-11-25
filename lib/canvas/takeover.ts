import type { CanvasState, CanvasDeployment } from '@/lib/types'
import { resolveGeometry, type ResolvedGeometry, type ResolvedSlot } from './geometry'

export type CanvasTakeover = {
  deployment: CanvasDeployment
  geometry: ResolvedGeometry
  slot: ResolvedSlot
}

/**
 * A canvas takeover overrides the frame's own layout and schedule while it is
 * live. It never mutates the frame document, so releasing needs no restore.
 */
export function resolveCanvasTakeover(state: CanvasState | null, nowMs: number): CanvasTakeover | null {
  if (!state) return null

  const candidate =
    state.pending && nowMs >= state.pending.effectiveAt ? state.pending : state.active
  if (!candidate) return null
  if (nowMs < candidate.effectiveAt) return null
  if (candidate.releaseAt !== null && nowMs >= candidate.releaseAt) return null

  const geometry = resolveGeometry(candidate.config)
  const slot = geometry.slots.find((entry) => entry.slotId === candidate.slotId)
  if (!slot) return null

  return { deployment: candidate, geometry, slot }
}
