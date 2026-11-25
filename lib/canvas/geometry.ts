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
  rotation?: 0 | 90 | 180 | 270
}

export type GapRect = { x: number; y: number; w: number; h: number }

export function rotatedSlotStyle(slot: ResolvedSlot): {
  transform: string | undefined
  transformOrigin: string
} {
  const rotation = slot.rotation ?? 0
  // The translate/rotate/translate chain rotates around the slot centre, so the
  // CSS origin must stay at the wrapper's top-left corner.
  if (rotation === 0) return { transform: undefined, transformOrigin: 'top left' }
  return {
    transform: `translate(${slot.w / 2}px, ${slot.h / 2}px) rotate(${rotation}deg) translate(${-slot.w / 2}px, ${-slot.h / 2}px)`,
    transformOrigin: 'top left',
  }
}

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

export function canvasGapPx(config: CanvasConfig): number {
  if (config.bezelMode === 'collapse') return 0
  if (config.unitMode !== 'physical' || !config.screenWidthMm) return config.gap
  return Math.min(600, Math.max(0, (config.gap / config.screenWidthMm) * FRAME_WIDTH))
}

export type FrameScreenSize = {
  id: string
  screenWidthMm?: number | null
  screenHeightMm?: number | null
}

/** Canvas pixels per millimetre, normalised to the config's reference screen. */
export function canvasSlotScale(
  config: CanvasConfig,
  frames: FrameScreenSize[],
  slot: CanvasConfig['slots'][number],
): number {
  if (config.unitMode !== 'physical') return slot.scale
  const frame = frames.find((item) => item.id === slot.frameId)
  const widthMm = frame?.screenWidthMm
  const heightMm = frame?.screenHeightMm
  if (!widthMm || !heightMm || !config.screenWidthMm || !config.screenHeightMm) return slot.scale
  const ratio = Math.min(widthMm / config.screenWidthMm, heightMm / config.screenHeightMm)
  return slot.scale * Math.min(4, Math.max(0.25, ratio))
}

/** Console-side deploy blocker: every enrolled frame needs both dimensions. */
export function canvasPhysicalIssues(config: CanvasConfig, frames: FrameScreenSize[]): string[] {
  if (config.unitMode !== 'physical') return []
  return frames
    .filter((frame) => !frame.screenWidthMm || !frame.screenHeightMm)
    .map((frame) => frame.id)
}

/**
 * Place slots on the canvas. Pure and deterministic: the same config always
 * produces the same geometry. Coordinates are canvas px with the minimum
 * corner re-based to (0, 0).
 */
export function resolveGeometry(config: CanvasConfig, frames: FrameScreenSize[] = []): ResolvedGeometry {
  if (config.slots.length === 0) return { width: 0, height: 0, slots: [], gaps: [] }

  const scales = config.slots.map((slot) => canvasSlotScale(config, frames, slot))
  const sizes = config.slots.map((slot, index) => {
    const rotated = slot.rotation === 90 || slot.rotation === 270
    return {
      w: (rotated ? FRAME_HEIGHT : FRAME_WIDTH) * scales[index],
      h: (rotated ? FRAME_WIDTH : FRAME_HEIGHT) * scales[index],
    }
  })
  const gap = canvasGapPx(config)
  const raw: { x: number; y: number; w: number; h: number }[] = []

  if (config.arrangement === 'row') {
    const height = Math.max(...sizes.map((size) => size.h))
    let x = 0
    sizes.forEach((size) => {
      raw.push({ x, y: crossOffset(config.align, height, size.h), w: size.w, h: size.h })
      x += size.w + gap
    })
  } else if (config.arrangement === 'column') {
    const width = Math.max(...sizes.map((size) => size.w))
    let y = 0
    sizes.forEach((size) => {
      raw.push({ x: crossOffset(config.align, width, size.w), y, w: size.w, h: size.h })
      y += size.h + gap
    })
  } else {
    const columns = Math.min(8, Math.max(1, config.gridColumns ?? Math.ceil(Math.sqrt(config.slots.length))))
    const cellW = Math.max(...sizes.map((size) => size.w))
    const cellH = Math.max(...sizes.map((size) => size.h))
    sizes.forEach((size, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellX = column * (cellW + gap)
      const cellY = row * (cellH + gap)
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
    scale: scales[index],
    rotation: config.slots[index].rotation ?? 0,
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
function subtractSlot(rect: GapRect, slot: ResolvedSlot): GapRect[] {
  const left = Math.max(rect.x, slot.x)
  const top = Math.max(rect.y, slot.y)
  const right = Math.min(rect.x + rect.w, slot.x + slot.w)
  const bottom = Math.min(rect.y + rect.h, slot.y + slot.h)
  if (right <= left || bottom <= top) return [rect]

  const pieces: GapRect[] = []
  if (top > rect.y) pieces.push({ x: rect.x, y: rect.y, w: rect.w, h: top - rect.y })
  if (bottom < rect.y + rect.h) pieces.push({ x: rect.x, y: bottom, w: rect.w, h: rect.y + rect.h - bottom })
  const stripH = bottom - top
  if (left > rect.x) pieces.push({ x: rect.x, y: top, w: left - rect.x, h: stripH })
  if (right < rect.x + rect.w) pieces.push({ x: right, y: top, w: rect.x + rect.w - right, h: stripH })
  return pieces
}

function computeGaps(slots: ResolvedSlot[]): GapRect[] {
  const gaps: GapRect[] = []
  const seen = new Set<string>()
  const add = (candidate: GapRect) => {
    let pieces = [candidate]
    for (const slot of slots) pieces = pieces.flatMap((piece) => subtractSlot(piece, slot))
    for (const piece of pieces) {
      const key = `${piece.x},${piece.y},${piece.w},${piece.h}`
      if (!seen.has(key)) {
        seen.add(key)
        gaps.push(piece)
      }
    }
  }

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
          add({ x: Math.max(a.x, b.x), y: yStart, w: xOverlap, h: yEnd - yStart })
        }
      }

      if (yOverlap > 0 && xOverlap <= 0) {
        const xStart = Math.min(a.x + a.w, b.x + b.w)
        const xEnd = Math.max(a.x, b.x)
        if (xEnd > xStart) {
          add({ x: xStart, y: Math.max(a.y, b.y), w: xEnd - xStart, h: yOverlap })
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
