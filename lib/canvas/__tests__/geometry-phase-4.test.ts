import { describe, expect, it } from 'vitest'
import { canvasGapPx, canvasPhysicalIssues, resolveGeometry, type FrameScreenSize } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'

const base: CanvasConfig = {
  arrangement: 'row',
  gap: 120,
  align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

describe('phase 4 geometry', () => {
  it('collapses the gap when bezelMode is collapse', () => {
    expect(resolveGeometry({ ...base, bezelMode: 'collapse' }).slots[1].x).toBe(1080)
    expect(resolveGeometry({ ...base, bezelMode: 'collapse' }).gaps).toEqual([])
    expect(resolveGeometry({ ...base, bezelMode: 'hide' }).slots[1].x).toBe(1200)
    expect(resolveGeometry({ ...base, bezelMode: 'hide' }).gaps).toHaveLength(1)
  })

  it('converts millimetre gaps to canvas pixels', () => {
    const config: CanvasConfig = {
      ...base,
      gap: 172,
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    }
    expect(canvasGapPx(config)).toBe(540)
    expect(resolveGeometry(config).slots[1].x).toBe(1620)
  })

  it('derives each physical slot scale from its frame screen dimensions', () => {
    const config: CanvasConfig = {
      ...base,
      bezelMode: 'collapse',
      unitMode: 'physical',
      screenWidthMm: 344,
      screenHeightMm: 193,
    }
    const frames: FrameScreenSize[] = [
      { id: 'fa', screenWidthMm: 344, screenHeightMm: 193 },
      { id: 'fb', screenWidthMm: 688, screenHeightMm: 386 },
    ]
    const geometry = resolveGeometry(config, frames)
    expect(geometry.slots.map((slot) => slot.scale)).toEqual([1, 2])
    expect(geometry.slots[1].w).toBe(2160)
    expect(geometry.slots[1].h).toBe(3840)
    expect(geometry.slots[1].x).toBe(1080)
    expect(resolveGeometry(config, [{ id: 'fa', screenWidthMm: null, screenHeightMm: null }]).slots[0].scale).toBe(1)
  })

  it('swaps slot dimensions for quarter-turn rotations', () => {
    const config: CanvasConfig = {
      ...base,
      slots: [{ ...base.slots[0], rotation: 90 }],
    }
    const slot = resolveGeometry(config).slots[0]
    expect(slot.w).toBe(1920)
    expect(slot.h).toBe(1080)
    expect(slot.rotation).toBe(90)
  })

  it('names frames missing physical screen dimensions', () => {
    const config: CanvasConfig = { ...base, unitMode: 'physical', screenWidthMm: 344, screenHeightMm: 193 }
    expect(canvasPhysicalIssues(config, [
      { id: 'fa', screenWidthMm: 344, screenHeightMm: 193 },
      { id: 'fb', screenWidthMm: null, screenHeightMm: 193 },
    ])).toEqual(['fb'])
  })
})
