import type { CanvasConfig } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

export type ResolvedSlot = {
  slotId: string
  index: number
  marker: number
  x: number
  y: number
  w: number
  h: number
  scale: number
}

export type GapRect = { x: number; y: number; w: number; h: number }

export type ResolvedGeometry = {
  width: number
  height: number
  slots: ResolvedSlot[]
  gaps: GapRect[]
}

export type GeometryIssue = {
  code: 'E_OVERLAP' | 'E_TOO_LARGE' | 'E_NO_SLOTS'
  message: string
  slotIds?: string[]
}

const MAX_CANVAS_CPX = 32000

function crossOffset(align: 'start' | 'center' | 'end', outer: number, inner: number): number {
  if (align === 'start') return 0
  if (align === 'end') return outer - inner
  return (outer - inner) / 2
}

/**
 * Place slots on the canvas. Pure and deterministic: the same config always
 * produces the same geometry. Coordinates are canvas px with the minimum
 * corner re-based to (0, 0).
 */
export function resolveGeometry(config: CanvasConfig): ResolvedGeometry {
  if (config.slots.length === 0) return { width: 0, height: 0, slots: [], gaps: [] }

  const sizes = config.slots.map((slot) => ({ w: FRAME_WIDTH * slot.scale, h: FRAME_HEIGHT * slot.scale }))
  const raw: { x: number; y: number; w: number; h: number }[] = []

  if (config.arrangement === 'row') {
    const height = Math.max(...sizes.map((size) => size.h))
    let x = 0
    sizes.forEach((size) => {
      raw.push({ x, y: crossOffset(config.align, height, size.h), w: size.w, h: size.h })
      x += size.w + config.gap
    })
  } else if (config.arrangement === 'column') {
    const width = Math.max(...sizes.map((size) => size.w))
    let y = 0
    sizes.forEach((size) => {
      raw.push({ x: crossOffset(config.align, width, size.w), y, w: size.w, h: size.h })
      y += size.h + config.gap
    })
  } else {
    const columns = Math.min(8, Math.max(1, config.gridColumns ?? Math.ceil(Math.sqrt(config.slots.length))))
    const cellW = Math.max(...sizes.map((size) => size.w))
    const cellH = Math.max(...sizes.map((size) => size.h))
    sizes.forEach((size, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellX = column * (cellW + config.gap)
      const cellY = row * (cellH + config.gap)
      raw.push({
        x: cellX + crossOffset(config.align, cellW, size.w),
        y: cellY + crossOffset(config.align, cellH, size.h),
        w: size.w,
        h: size.h,
      })
    })
  }

  raw.forEach((rect, index) => {
    rect.x += config.slots[index].offset.x
    rect.y += config.slots[index].offset.y
  })

  const minX = Math.min(...raw.map((rect) => rect.x))
  const minY = Math.min(...raw.map((rect) => rect.y))

  const slots: ResolvedSlot[] = raw.map((rect, index) => ({
    slotId: config.slots[index].id,
    index,
    marker: index + 1,
    x: rect.x - minX,
    y: rect.y - minY,
    w: rect.w,
    h: rect.h,
    scale: config.slots[index].scale,
  }))

  const width = Math.max(...slots.map((slot) => slot.x + slot.w))
  const height = Math.max(...slots.map((slot) => slot.y + slot.h))

  return { width, height, slots, gaps: computeGaps(slots) }
}

/**
 * Gap rectangles are the visible bezel bands between non-overlapping slots.
 * Two slots qualify when they have positive overlap on one axis and positive
 * separation on the other. O(n^2) with n <= 16 is deliberate and cheap.
 */
function computeGaps(slots: ResolvedSlot[]): GapRect[] {
  const gaps: GapRect[] = []
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)

      if (xOverlap > 0 && yOverlap <= 0) {
        const yStart = Math.min(a.y + a.h, b.y + b.h)
        const yEnd = Math.max(a.y, b.y)
        if (yEnd > yStart) {
          gaps.push({ x: Math.max(a.x, b.x), y: yStart, w: xOverlap, h: yEnd - yStart })
        }
      }

      if (yOverlap > 0 && xOverlap <= 0) {
        const xStart = Math.min(a.x + a.w, b.x + b.w)
        const xEnd = Math.max(a.x, b.x)
        if (xEnd > xStart) {
          gaps.push({ x: xStart, y: Math.max(a.y, b.y), w: xEnd - xStart, h: yOverlap })
        }
      }
    }
  }
  return gaps
}

export function validateGeometry(geometry: ResolvedGeometry): GeometryIssue[] {
  const issues: GeometryIssue[] = []
  if (geometry.slots.length === 0) {
    issues.push({ code: 'E_NO_SLOTS', message: 'A canvas needs at least one slot' })
    return issues
  }

  if (geometry.width > MAX_CANVAS_CPX || geometry.height > MAX_CANVAS_CPX) {
    issues.push({ code: 'E_TOO_LARGE', message: `Canvas is larger than ${MAX_CANVAS_CPX} cpx` })
  }

  for (let i = 0; i < geometry.slots.length; i++) {
    for (let j = i + 1; j < geometry.slots.length; j++) {
      const a = geometry.slots[i]
      const b = geometry.slots[j]
      const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (overlapW > 0 && overlapH > 0) {
        issues.push({ code: 'E_OVERLAP', message: `Slots ${a.slotId} and ${b.slotId} overlap`, slotIds: [a.slotId, b.slotId] })
      }
    }
  }

  return issues
}
