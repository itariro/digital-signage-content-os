import { describe, expect, it } from 'vitest'
import type { CanvasConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import {
  transitionClipPath,
  transitionMaskAt,
  transitionProgress,
} from '@/lib/canvas/transitions'

const config = (gap: number, count = 2): CanvasConfig => ({
  arrangement: 'row',
  gap,
  align: 'center',
  slots: Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    frameId: `f${index}`,
    offset: { x: 0, y: 0 },
    scale: 1,
  })),
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
})

describe('transitionProgress', () => {
  it('is 1 for no transition and clamps time into 0..1', () => {
    expect(transitionProgress(undefined, 0)).toBe(1)
    expect(transitionProgress({ kind: 'none', durationMs: 500, direction: 'left' }, 0)).toBe(1)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, -1)).toBe(0)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, 500)).toBe(0.5)
    expect(transitionProgress({ kind: 'wipe', durationMs: 1000, direction: 'left' }, 5000)).toBe(1)
  })
})

describe('transitionMaskAt', () => {
  const geometry = resolveGeometry(config(120, 2))

  it('starts empty and ends full for every kind', () => {
    for (const kind of ['wipe', 'iris', 'chase'] as const) {
      for (const slot of geometry.slots) {
        expect(transitionMaskAt(kind, 0, slot, geometry).coverage).toBe(0)
        expect(transitionMaskAt(kind, 1, slot, geometry).coverage).toBe(1)
      }
    }
  })

  it('wipes with one wall-wide front at t=0, mid and t=1', () => {
    const [left, right] = geometry.slots
    const start = transitionMaskAt('wipe', 0, left, geometry)
    const midLeft = transitionMaskAt('wipe', 0.5, left, geometry)
    const midRight = transitionMaskAt('wipe', 0.5, right, geometry)
    const end = transitionMaskAt('wipe', 1, right, geometry)
    expect(start.coverage).toBe(0)
    expect(start.front).toBe(0)
    // At p=0.5 the wall front sits at 1140 px, inside the 120 px gap between
    // the two frames: the left frame is fully revealed and the right untouched.
    expect(midLeft.coverage).toBe(1)
    expect(midRight.coverage).toBe(0)
    expect(midLeft.front).toBe(midRight.front)
    expect(midLeft.front).toBe(1140)
    expect(end.coverage).toBe(1)
    expect(end.front).toBe(geometry.width)
  })

  it('keeps the wipe front continuous at the bezel', () => {
    const [left, right] = geometry.slots
    const atBezel = 1080 / geometry.width
    const justBefore = transitionMaskAt('wipe', atBezel - 0.001, left, geometry)
    const atEdge = transitionMaskAt('wipe', atBezel, left, geometry)
    const afterGap = transitionMaskAt('wipe', (1080 + 120) / geometry.width, right, geometry)
    expect(atEdge.coverage).toBe(1)
    expect(justBefore.coverage).toBeLessThan(1)
    expect(afterGap.coverage).toBe(0)
    expect(justBefore.front).toBeLessThan(left.x + left.w)
    expect(atEdge.front).toBeCloseTo(left.x + left.w, 6)
    expect(afterGap.front).toBeCloseTo(right.x, 6)
  })

  it('wipes from any direction', () => {
    const [left, right] = geometry.slots
    // Reverse travel at p=0.5 stops at 1140 px, so the left frame is still
    // hidden and the right frame is already fully revealed.
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'right').coverage).toBe(0)
    expect(transitionMaskAt('wipe', 0.5, right, geometry, 'right').coverage).toBe(1)
    // Vertical travel spans the wall height (1920 px), so half way both
    // full-height slots are half covered.
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'up').coverage).toBeCloseTo(0.5, 4)
    expect(transitionMaskAt('wipe', 0.5, left, geometry, 'down').coverage).toBeCloseTo(0.5, 4)
  })

  it('opens an iris from the wall centre', () => {
    const three = resolveGeometry(config(0, 3))
    const middle = three.slots[1]
    const edge = three.slots[0]
    const middleMid = transitionMaskAt('iris', 0.5, middle, three)
    const edgeMid = transitionMaskAt('iris', 0.5, edge, three)
    expect(middleMid.radius).toBe(edgeMid.radius)
    expect(middleMid.coverage).toBeGreaterThanOrEqual(edgeMid.coverage)
    expect(transitionMaskAt('iris', 1, edge, three).coverage).toBe(1)
  })

  it('chases slot indexes rather than measuring a wall position', () => {
    const three = resolveGeometry(config(0, 3))
    expect(transitionMaskAt('chase', 0, three.slots[0], three).coverage).toBe(0)
    expect(transitionMaskAt('chase', 1 / 3, three.slots[0], three).coverage).toBe(1)
    expect(transitionMaskAt('chase', 1 / 3, three.slots[1], three).coverage).toBe(0)
    expect(transitionMaskAt('chase', 0.5, three.slots[1], three).coverage).toBeCloseTo(0.5, 4)
    expect(transitionMaskAt('chase', 1, three.slots[2], three).coverage).toBe(1)
  })
})

describe('transitionClipPath', () => {
  it('clips in wall coordinates for a single slot', () => {
    const single = resolveGeometry(config(0, 1))
    const slot = single.slots[0]
    expect(transitionClipPath('none', transitionMaskAt('wipe', 0.25, slot, single, 'left'), 'left', slot, single)).toBe('none')
    expect(transitionClipPath('wipe', transitionMaskAt('wipe', 0.25, slot, single, 'left'), 'left', slot, single)).toBe('inset(0 75% 0 0)')
    expect(transitionClipPath('wipe', transitionMaskAt('wipe', 0.25, slot, single, 'right'), 'right', slot, single)).toBe('inset(0 0 0 75%)')
    expect(transitionClipPath('wipe', transitionMaskAt('wipe', 0.25, slot, single, 'up'), 'up', slot, single)).toBe('inset(0 0 75% 0)')
    expect(transitionClipPath('wipe', transitionMaskAt('wipe', 0.25, slot, single, 'down'), 'down', slot, single)).toBe('inset(75% 0 0 0)')
    expect(transitionClipPath('chase', transitionMaskAt('chase', 0.25, slot, single, 'left'), 'left', slot, single)).toBe('inset(0 75% 0 0)')
    const irisMask = transitionMaskAt('iris', 0.25, slot, single, 'left')
    expect(transitionClipPath('iris', irisMask, 'left', slot, single)).toBe(
      `circle(${irisMask.radius}px at ${single.width / 2}px ${single.height / 2}px)`,
    )
  })

  it('keeps a wipe wall-relative across two frames', () => {
    const two = resolveGeometry(config(0, 2))
    const [left, right] = two.slots
    const maskLeft = transitionMaskAt('wipe', 0.25, left, two, 'left')
    const maskRight = transitionMaskAt('wipe', 0.25, right, two, 'left')
    expect(transitionClipPath('wipe', maskLeft, 'left', left, two)).toBe('inset(0 75% 0 0)')
    expect(transitionClipPath('wipe', maskRight, 'left', right, two)).toBe('inset(0 75% 0 0)')
  })

  it('opens an iris from wall center even when slot corners are equidistant', () => {
    const single = resolveGeometry(config(0, 1))
    const slot = single.slots[0]
    const mid = transitionMaskAt('iris', 0.5, slot, single)
    expect(mid.coverage).toBeGreaterThan(0)
    expect(mid.coverage).toBeLessThan(1)
    expect(transitionClipPath('iris', mid, 'left', slot, single)).toBe(
      `circle(${mid.radius}px at ${single.width / 2}px ${single.height / 2}px)`,
    )
  })
})
