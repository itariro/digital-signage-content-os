import type { CanvasArrangement, MarqueeConfig, MarqueeStrip } from '@/lib/types'
import type { ResolvedGeometry, ResolvedSlot } from '@/lib/canvas/geometry'
import type { SceneStateContext } from './types'

export type MarqueeState = {
  axis: 'x' | 'y'
  direction: MarqueeConfig['direction']
  tauPx: number
  strip: MarqueeStrip
  crossStart: number
  crossSize: number
  lineHeight: number
  fontSize: number
  orientation: MarqueeConfig['orientation']
  layout: MarqueeConfig['layout']
  repeat: boolean
  gap: number
  style: MarqueeConfig['style']
}

const DEFAULT_SEPARATOR = '   •   '
const MAX_COPIES = 64

export function coerceDirection(direction: MarqueeConfig['direction'], arrangement: CanvasArrangement): MarqueeConfig['direction'] {
  if (arrangement === 'row') return direction === 'right' ? 'right' : 'left'
  if (arrangement === 'column') return direction === 'down' ? 'down' : 'up'
  return direction
}

export function travelAxis(direction: MarqueeConfig['direction']): 'x' | 'y' {
  return direction === 'left' || direction === 'right' ? 'x' : 'y'
}

/**
 * Fill a missing strip from stored text or a deterministic estimate. The
 * editor replaces the estimate after measuring; playback never waits for it.
 */
export function ensureStrip(config: MarqueeConfig, bounds: { width: number; height: number }): MarqueeStrip | undefined {
  if (config.strip) return config.strip
  const axis = travelAxis(config.direction)

  if (config.layout === 'block') {
    const cross = axis === 'x' ? bounds.height : bounds.width
    const segments = config.lines.map((line, index) => ({ text: line, at: index * config.lineHeight, w: config.lineHeight }))
    return { lengthPx: Math.max(1, segments.length * config.lineHeight), crossPx: Math.max(1, cross), segments }
  }

  const text = config.lines.join(config.separator || DEFAULT_SEPARATOR)
  if (text.length === 0) return { lengthPx: 1, crossPx: 1, segments: [] }
  const width = Math.max(1, Math.round(text.length * config.fontSize * 0.6))
  return {
    lengthPx: width,
    crossPx: Math.max(1, Math.round(config.fontSize * 1.3)),
    segments: [{ text, at: 0, w: width }],
  }
}

/** Canvas-axis start of copy `j` for the current travel distance. */
export function copyPosition(config: MarqueeConfig, geometry: ResolvedGeometry, tauPx: number, j: number): number {
  const strip = ensureStrip(config, geometry)
  const T = Math.max(1, strip?.lengthPx ?? 1)
  const axis = travelAxis(config.direction)
  const L = axis === 'x' ? geometry.width : geometry.height
  const P = Math.max(1, T + Math.max(0, config.gap))
  const approach = config.direction === 'left' || config.direction === 'up'
  return approach ? L - tauPx + j * P : -T + tauPx - j * P
}

/**
 * Indices of strip copies that intersect this slot window. Enumeration starts
 * at the first copy that can intersect at this travel distance, so repeats keep
 * running past copy 63. At most 64 copies are returned per slot.
 */
export function visibleCopies(
  config: MarqueeConfig,
  geometry: ResolvedGeometry,
  slot: ResolvedSlot,
  tauPx: number,
): number[] {
  const strip = ensureStrip(config, geometry)
  if (!strip) return []

  const axis = travelAxis(config.direction)
  const slotStart = axis === 'x' ? slot.x : slot.y
  const slotEnd = slotStart + (axis === 'x' ? slot.w : slot.h)
  const T = Math.max(1, strip.lengthPx)
  const approach = config.direction === 'left' || config.direction === 'up'
  const P = Math.max(1, T + Math.max(0, config.gap))
  const L = axis === 'x' ? geometry.width : geometry.height
  const first = approach
    ? Math.max(0, Math.floor((tauPx + slotStart - L - T) / P) + 1)
    : Math.max(0, Math.floor((tauPx - T - slotEnd) / P) + 1)
  if (!config.repeat && first > 0) return []

  const copies: number[] = []
  for (let n = 0; n < MAX_COPIES; n++) {
    const j = first + n
    if (!config.repeat && j > first) break
    const x = copyPosition(config, geometry, tauPx, j)
    if (x < slotEnd && x + T > slotStart) copies.push(j)
    if (approach && x >= slotEnd) break
    if (!approach && x + T <= slotStart) break
  }

  return copies
}

/** Number of DOM copy slots needed to paint the most that can fit in `slot`. */
export function marqueePoolSize(config: MarqueeConfig, geometry: ResolvedGeometry, slot: ResolvedSlot): number {
  if (!config.repeat) return 1
  const strip = ensureStrip(config, geometry)
  const T = Math.max(1, strip?.lengthPx ?? 1)
  const P = Math.max(1, T + Math.max(0, config.gap))
  const S = travelAxis(config.direction) === 'x' ? slot.w : slot.h
  return Math.min(MAX_COPIES, Math.ceil((S + T) / P))
}

export function visibleSegments(strip: MarqueeStrip, copyX: number, slotStart: number, slotEnd: number) {
  return strip.segments.filter((segment) => copyX + segment.at < slotEnd && copyX + segment.at + segment.w > slotStart)
}

export function marqueeState(config: MarqueeConfig, ctx: SceneStateContext): MarqueeState {
  const axis = travelAxis(config.direction)
  const strip = ensureStrip(config, ctx.bounds) ?? { lengthPx: 1, crossPx: 1, segments: [] }
  const cross = axis === 'x' ? ctx.bounds.height : ctx.bounds.width
  const crossOffset = config.align === 'start' ? 0 : config.align === 'end' ? cross - strip.crossPx : (cross - strip.crossPx) / 2

  return {
    axis,
    direction: config.direction,
    tauPx: (Math.max(0, ctx.tMs) / 1000) * config.speed,
    strip,
    crossStart: crossOffset + config.crossOffset,
    crossSize: cross,
    lineHeight: config.lineHeight,
    fontSize: config.fontSize,
    orientation: config.orientation,
    layout: config.layout,
    repeat: config.repeat,
    gap: config.gap,
    style: config.style,
  }
}
