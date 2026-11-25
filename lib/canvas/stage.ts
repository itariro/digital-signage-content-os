import type { CanvasTakeover } from './takeover'

/** Largest uniform scale that fits a slot inside the viewport. */
export function fitScale(slotW: number, slotH: number, viewportW: number, viewportH: number): number {
  if (!(slotW > 0) || !(slotH > 0) || !(viewportW > 0) || !(viewportH > 0)) return 0
  return Math.min(viewportW / slotW, viewportH / slotH)
}

/**
 * Identifies one animation loop. React rebuilds the takeover object on every
 * render, so the loop must key on values instead of object identity.
 */
export function canvasLoopKey(takeover: CanvasTakeover | null, clockOffsetMs: number): string {
  if (!takeover) return 'none'
  const { deployment, geometry, slot } = takeover
  return [
    deployment.canvasId,
    deployment.revision,
    deployment.effectiveAt,
    deployment.releaseAt ?? 'none',
    deployment.album?.id ?? 'none',
    deployment.album?.crossfadeMs ?? 0,
    deployment.config.maxFps,
    geometry.width,
    geometry.height,
    slot.slotId,
    slot.x,
    slot.y,
    slot.w,
    slot.h,
    clockOffsetMs,
  ].join('|')
}
