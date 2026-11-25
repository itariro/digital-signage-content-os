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
  const wallFar = Math.max(...geometry.slots.flatMap((item) => cornerDistances(item, cx, cy)), 1)
  const radius = progress * wallFar
  if (!(far > near)) return { coverage: clamp(radius / far, 0, 1), radius }
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

/**
 * CSS clip in wall coordinates for a wall-sized element. Using the wall box
 * keeps wipe/iris fronts continuous across bezels and avoids slot-relative
 * percentage distortion.
 */
export function transitionClipPath(
  kind: CanvasTransitionKind,
  mask: TransitionMask,
  direction: CanvasTransitionDirection = 'left',
  slot?: ResolvedSlot,
  geometry?: ResolvedGeometry,
): string {
  if (kind === 'none') return 'none'

  if (kind === 'iris') {
    const cx = (geometry?.width ?? 0) / 2
    const cy = (geometry?.height ?? 0) / 2
    return `circle(${mask.radius}px at ${cx}px ${cy}px)`
  }

  if (kind === 'chase') {
    const w = Math.max(1, geometry?.width ?? slot?.w ?? 1)
    const h = Math.max(1, geometry?.height ?? slot?.h ?? 1)
    const sx = slot?.x ?? 0
    const sy = slot?.y ?? 0
    const sw = slot?.w ?? w
    const sh = slot?.h ?? h
    const c = clamp(mask.coverage, 0, 1)
    const pct = (value: number) => {
      const p = value * 100
      return p === 0 ? '0' : `${p}%`
    }
    if (direction === 'right') {
      const left = sx + sw * (1 - c)
      const right = sx + sw
      return `inset(0 ${pct(1 - right / w)} 0 ${pct(left / w)})`
    }
    if (direction === 'up') {
      const top = sy
      const bottom = sy + sh * c
      return `inset(${pct(top / h)} 0 ${pct(1 - bottom / h)} 0)`
    }
    if (direction === 'down') {
      const top = sy + sh * (1 - c)
      const bottom = sy + sh
      return `inset(${pct(top / h)} 0 ${pct(1 - bottom / h)} 0)`
    }
    const left = sx
    const right = sx + sw * c
    return `inset(0 ${pct(1 - right / w)} 0 ${pct(left / w)})`
  }

  const w = Math.max(1, geometry?.width ?? 1)
  const h = Math.max(1, geometry?.height ?? 1)
  const front = mask.front
  if (direction === 'right') return `inset(0 0 0 ${clamp(front / w, 0, 1) * 100}%)`
  if (direction === 'up') return `inset(0 0 ${clamp(1 - front / h, 0, 1) * 100}% 0)`
  if (direction === 'down') return `inset(${clamp(front / h, 0, 1) * 100}% 0 0 0)`
  return `inset(0 ${clamp(1 - front / w, 0, 1) * 100}% 0 0)`
}
