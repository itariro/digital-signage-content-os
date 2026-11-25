import { describe, expect, it } from 'vitest'
import type { CanvasConfig } from '@/lib/types'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

function config(overrides: Partial<CanvasConfig> = {}): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 0,
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
    ...overrides,
  }
}

describe('resolveGeometry', () => {
  it('lays out a row with a gap and center alignment', () => {
    const g = resolveGeometry(config({ gap: 120 }))
    expect(g.width).toBe(FRAME_WIDTH * 2 + 120)
    expect(g.height).toBe(FRAME_HEIGHT)
    expect(g.slots.map((slot) => slot.x)).toEqual([0, FRAME_WIDTH + 120])
    expect(g.slots.map((slot) => slot.marker)).toEqual([1, 2])
    expect(g.gaps).toEqual([{ x: FRAME_WIDTH, y: 0, w: 120, h: FRAME_HEIGHT }])
    expect(validateGeometry(g)).toEqual([])
  })

  it('lays out a column with end alignment', () => {
    const g = resolveGeometry(config({ arrangement: 'column', align: 'end', gap: 60 }))
    expect(g.height).toBe(FRAME_HEIGHT * 2 + 60)
    expect(g.width).toBe(FRAME_WIDTH)
    expect(g.slots[0].y).toBe(0)
    expect(g.slots[1].y).toBe(FRAME_HEIGHT + 60)
  })

  it('lays out a grid row-major with grid columns', () => {
    const slots = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, frameId: null, offset: { x: 0, y: 0 }, scale: 1 }))
    const g = resolveGeometry(config({ arrangement: 'grid', gridColumns: 2, gap: 10, slots }))
    expect(g.width).toBe(FRAME_WIDTH * 2 + 10)
    expect(g.height).toBe(FRAME_HEIGHT * 2 + 10)
    expect(g.slots[2].x).toBe(0)
    expect(g.slots[2].y).toBe(FRAME_HEIGHT + 10)
  })

  it('applies per-slot offsets and re-bases the bounding box', () => {
    const g = resolveGeometry(config({
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 100, y: 50 }, scale: 1 },
        { id: 'b', frameId: 'fb', offset: { x: 100, y: 50 }, scale: 1 },
      ],
    }))
    expect(g.slots[0].x).toBe(0)
    expect(g.slots[0].y).toBe(0)
    expect(g.width).toBe(FRAME_WIDTH * 2)
  })

  it('supports different scales while keeping the slot size', () => {
    const g = resolveGeometry(config({
      align: 'start',
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 0.5 },
        { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
      ],
    }))
    expect(g.slots[0].w).toBe(FRAME_WIDTH / 2)
    expect(g.slots[0].h).toBe(FRAME_HEIGHT / 2)
    expect(g.slots[1].w).toBe(FRAME_WIDTH)
  })

  it('is deterministic', () => {
    const a = resolveGeometry(config({ gap: 17 }))
    const b = resolveGeometry(config({ gap: 17 }))
    expect(a).toEqual(b)
  })

  it('renumbers markers contiguously after removal', () => {
    const three = resolveGeometry(config({
      slots: ['a', 'b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
    }))
    const two = resolveGeometry(config({
      slots: ['b', 'c'].map((id) => ({ id, frameId: id, offset: { x: 0, y: 0 }, scale: 1 })),
    }))
    expect(three.slots[2].marker).toBe(3)
    expect(two.slots.map((slot) => slot.marker)).toEqual([1, 2])
    expect(two.slots[0].slotId).toBe('b')
  })
})

describe('validateGeometry', () => {
  it('reports overlap, too large and no slots', () => {
    const overlap = resolveGeometry(config({
      slots: [
        { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
        { id: 'b', frameId: 'fb', offset: { x: -100, y: 0 }, scale: 1 },
      ],
    }))
    expect(validateGeometry(overlap).map((issue) => issue.code)).toContain('E_OVERLAP')

    const huge = resolveGeometry(config({
      slots: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, frameId: `f${i}`, offset: { x: 0, y: 0 }, scale: 2 })),
    }))
    expect(validateGeometry(huge).map((issue) => issue.code)).toContain('E_TOO_LARGE')

    expect(validateGeometry({ width: 0, height: 0, slots: [], gaps: [] }).map((issue) => issue.code)).toEqual(['E_NO_SLOTS'])
  })

  it('accepts touching edges', () => {
    const g = resolveGeometry(config({ gap: 0, align: 'start' }))
    expect(validateGeometry(g)).toEqual([])
  })
})
