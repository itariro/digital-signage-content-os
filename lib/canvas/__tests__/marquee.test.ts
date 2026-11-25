import { describe, expect, it } from 'vitest'
import type { CanvasArrangement, MarqueeConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import {
  coerceDirection,
  copyPosition,
  ensureStrip,
  marqueePoolSize,
  marqueeState,
  visibleCopies,
  visibleSegments,
} from '@/lib/canvas/scenes/marquee'

const config: MarqueeConfig = {
  lines: ['Hello, wall'],
  layout: 'line',
  separator: '   •   ',
  direction: 'left',
  orientation: 'upright',
  speed: 240,
  repeat: true,
  gap: 100,
  lineHeight: 200,
  fontSize: 160,
  align: 'center',
  crossOffset: 0,
  style: {
    fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center',
    color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
    radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
  },
  strip: { lengthPx: 500, crossPx: 200, segments: [{ text: 'Hello', at: 0, w: 500 }] },
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})

const bounds = { width: geometry.width, height: geometry.height }

describe('coerceDirection', () => {
  it('keeps directions the arrangement allows and replaces the rest', () => {
    expect(coerceDirection('right', 'row')).toBe('right')
    expect(coerceDirection('up', 'row')).toBe('left')
    expect(coerceDirection('down', 'column')).toBe('down')
    expect(coerceDirection('left', 'column')).toBe('up')
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      expect(coerceDirection(direction, 'grid' as CanvasArrangement)).toBe(direction)
    }
  })
})

describe('ensureStrip', () => {
  it('returns a stored strip unchanged', () => {
    expect(ensureStrip(config, bounds)).toBe(config.strip)
  })

  it('derives a block strip without measuring', () => {
    const strip = ensureStrip({ ...config, layout: 'block', lines: ['a', 'b', 'c'], lineHeight: 100, strip: undefined }, bounds)!
    expect(strip.lengthPx).toBe(300)
    expect(strip.crossPx).toBe(bounds.height)
    expect(strip.segments.map((segment) => segment.at)).toEqual([0, 100, 200])
    expect(strip.segments.every((segment) => segment.w === 100)).toBe(true)
  })

  it('estimates a line strip when the API created the scene', () => {
    const strip = ensureStrip({ ...config, strip: undefined, lines: ['abc'] }, bounds)!
    expect(strip.lengthPx).toBeGreaterThan(0)
    expect(strip.crossPx).toBeGreaterThan(0)
    expect(strip.segments).toHaveLength(1)
    expect(strip.segments[0].w).toBe(strip.lengthPx)
  })
})

describe('copyPosition', () => {
  it('starts at the canvas edge and steps by length plus gap', () => {
    expect(copyPosition(config, geometry, 0, 0)).toBe(geometry.width)
    expect(copyPosition(config, geometry, 2000, 1)).toBe(geometry.width - 2000 + 600)
    expect(copyPosition({ ...config, direction: 'right' }, geometry, 0, 0)).toBe(-500)
  })
})

describe('visibleCopies', () => {
  it('enters from the edge at t = 0 for a left marquee', () => {
    expect(visibleCopies(config, geometry, geometry.slots[0], 0)).toEqual([])
    expect(visibleCopies(config, geometry, geometry.slots[1], 0)).toEqual([])
    expect(visibleCopies(config, geometry, geometry.slots[1], 100)).toEqual([0])
  })

  it('shows two copies in the left slot after one travel length', () => {
    expect(visibleCopies(config, geometry, geometry.slots[0], 2000)).toEqual([0, 1])
  })

  it('mirrors the formula for right, up and down', () => {
    expect(visibleCopies({ ...config, direction: 'right' }, geometry, geometry.slots[0], 0)).toEqual([])
    expect(visibleCopies({ ...config, direction: 'right' }, geometry, geometry.slots[0], 500)).toEqual([0])
    expect(visibleCopies({ ...config, direction: 'up' }, geometry, geometry.slots[0], 2000)).toEqual([0, 1, 2, 3])
    expect(visibleCopies({ ...config, direction: 'down' }, geometry, geometry.slots[0], 500)).toEqual([0])
  })

  it('keeps only copy 0 when repeat is off', () => {
    const once = { ...config, repeat: false }
    expect(visibleCopies(once, geometry, geometry.slots[1], 100)).toEqual([0])
    expect(visibleCopies(once, geometry, geometry.slots[1], 3000)).toEqual([])
  })

  it('never returns more than 64 copies', () => {
    const tiny = { ...config, gap: 0, strip: { lengthPx: 1, crossPx: 200, segments: [{ text: 'x', at: 0, w: 1 }] } }
    expect(visibleCopies(tiny, geometry, geometry.slots[0], 0).length).toBeLessThanOrEqual(64)
  })

  it('finds visible copies after the first 64 positions', () => {
    expect(visibleCopies(config, geometry, geometry.slots[0], 240_000)).toEqual([396, 397, 398])
    expect(visibleCopies(config, geometry, geometry.slots[1], 240_000)).toEqual([398, 399])
    expect(visibleCopies({ ...config, direction: 'right' }, geometry, geometry.slots[0], 240_000)).toEqual([398, 399])
  })
})

describe('marqueePoolSize', () => {
  it('sizes the pool from the slot and strip period', () => {
    expect(marqueePoolSize(config, geometry, geometry.slots[0])).toBe(3)
    expect(marqueePoolSize({ ...config, direction: 'up' }, geometry, geometry.slots[0])).toBe(5)
  })

  it('caps the pool and keeps non-repeating marquees to one copy', () => {
    const tiny = { ...config, gap: 0, strip: { lengthPx: 1, crossPx: 200, segments: [{ text: 'x', at: 0, w: 1 }] } }
    expect(marqueePoolSize(tiny, geometry, geometry.slots[0])).toBe(64)
    expect(marqueePoolSize({ ...config, repeat: false }, geometry, geometry.slots[0])).toBe(1)
  })
})

describe('visibleSegments', () => {
  it('culls segments outside the slot window', () => {
    const strip = { lengthPx: 1000, crossPx: 200, segments: [{ text: 'a', at: 0, w: 100 }, { text: 'b', at: 500, w: 100 }, { text: 'c', at: 900, w: 100 }] }
    expect(visibleSegments(strip, 0, 400, 800).map((segment) => segment.text)).toEqual(['b'])
  })
})

describe('marqueeState', () => {
  it('is slot independent and reports travel distance', () => {
    const ctx = { bounds, geometry, tMs: 1000, seed: 1 }
    const state = marqueeState(config, ctx)
    expect(state.axis).toBe('x')
    expect(state.tauPx).toBe(240)
    expect(state.strip).toBe(config.strip)
    expect(marqueeState(config, { ...ctx, seed: 99 })).toEqual(state)
  })

  it('places the strip on the cross axis with align and offset', () => {
    const state = marqueeState({ ...config, align: 'start', crossOffset: 25 }, { bounds, geometry, tMs: 0, seed: 1 })
    expect(state.crossStart).toBe(25)
  })
})
