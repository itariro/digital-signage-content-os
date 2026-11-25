import type { CanvasTransitionDirection, CanvasTransitionKind, CanvasWallTransition } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from './geometry'
import { clamp } from './math'

export type TransitionMask = {
  progress: number
  coverage: number
  front: number
  radius: number
  slotIndex: number
  axis: 'x' | 'y'
}

export function transitionProgress(transition: CanvasWallTransition | undefined, tMs: number): number {
  if (!transition || transition.kind === 'none' || !(transition.durationMs > 0)) return 1
  if (!Number.isFinite(tMs)) return 0
  return clamp(tMs / transition.durationMs, 0, 1)
}

function cornerDistances(rect: { x: number; y: number; w: number; h: number }, cx: number, cy: number): number[] {
  return [
    Math.hypot(rect.x - cx, rect.y - cy),
    Math.hypot(rect.x + rect.w - cx, rect.y - cy),
    Math.hypot(rect.x - cx, rect.y + rect.h - cy),
    Math.hypot(rect.x + rect.w - cx, rect.y + rect.h - cy),
  ]
}

function irisCoverage(progress: number, slot: ResolvedSlot, geometry: ResolvedGeometry): { coverage: number; radius: number } {
  const cx = geometry.width / 2
  const cy = geometry.height / 2
  const slotDistances = cornerDistances(slot, cx, cy)
  const near = Math.min(...slotDistances)
  const far = Math.max(...slotDistances)
  const wallFar = Math.max(...geometry.slots.flatMap((item) => cornerDistances(item, cx, cy)))
  const radius = progress * wallFar
  if (!(far > near)) return { coverage: progress >= 1 ? 1 : 0, radius }
  return { coverage: clamp((radius - near) / (far - near), 0, 1), radius }
}

/**
 * Pure per-slot mask. `wipe` and `iris` use wall coordinates, so the same front
 * or radius reaches every frame at the same instant. `chase` deliberately uses
 * `slot.index`, which is the one frame-aware transition.
 */
export function transitionMaskAt(
  kind: CanvasTransitionKind,
  progress: number,
  slot: ResolvedSlot,
  geometry: ResolvedGeometry,
  direction: CanvasTransitionDirection = 'left',
): TransitionMask {
  const p = clamp(progress, 0, 1)
  const axis: 'x' | 'y' = direction === 'up' || direction === 'down' ? 'y' : 'x'
  const length = axis === 'x' ? geometry.width : geometry.height
  const start = axis === 'x' ? slot.x : slot.y
  const span = Math.max(1, axis === 'x' ? slot.w : slot.h)
  const forward = direction === 'left' || direction === 'up'
  const front = forward ? p * length : length - p * length
  const radial = irisCoverage(p, slot, geometry)

  let coverage = 0
  if (kind === 'iris') {
    coverage = radial.coverage
  } else if (kind === 'chase') {
    const slots = Math.max(1, geometry.slots.length)
    coverage = clamp(p * slots - slot.index, 0, 1)
  } else if (kind !== 'none') {
    coverage = forward
      ? clamp((front - start) / span, 0, 1)
      : clamp((start + span - front) / span, 0, 1)
  }

  return {
    progress: p,
    coverage,
    front,
    radius: radial.radius,
    slotIndex: slot.index,
    axis,
  }
}

/** CSS clip for a slot-sized element. The mask stays pure; this only formats it. */
export function transitionClipPath(
  kind: CanvasTransitionKind,
  mask: TransitionMask,
  direction: CanvasTransitionDirection = 'left',
): string {
  if (kind === 'none') return 'none'
  const remaining = Math.max(0, 100 - mask.coverage * 100)
  if (kind === 'iris') return `circle(${Math.min(150, mask.coverage * 150)}% at 50% 50%)`
  if (direction === 'right') return `inset(0 0 0 ${remaining}%)`
  if (direction === 'up') return `inset(0 0 ${remaining}% 0)`
  if (direction === 'down') return `inset(${remaining}% 0 0 0)`
  return `inset(0 ${remaining}% 0 0)`
}
