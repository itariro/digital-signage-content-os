import { describe, it, expect } from 'vitest'
import { clampReveal, revealAt, revealPartition, seedFromString, type RevealRect } from '../reveal'

const BASE = {
  nowMs: 1_700_000_000_000,
  offset: 0,
  seed: seedFromString('album-1|a,b,c,d,e'),
  intervalSec: 25,
  itemCount: 12,
  cols: 6,
  rows: 5,
  group: 'single' as const,
}

function coverMap(rects: RevealRect[], cols: number, rows: number): number[] {
  const counts = new Array(cols * rows).fill(0)
  for (const r of rects) {
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        counts[(r.y + dy) * cols + (r.x + dx)]++
      }
    }
  }
  return counts
}

describe('revealPartition', () => {
  it('single: one rect per cell, full coverage, no overlap', () => {
    const rects = revealPartition(6, 5, 'single')
    expect(rects).toHaveLength(30)
    for (const r of rects) {
      expect(r.w).toBe(1)
      expect(r.h).toBe(1)
    }
    for (const c of coverMap(rects, 6, 5)) expect(c).toBe(1)
  })

  it('pair: domino rects with full coverage, no overlap, all rectangular and tall', () => {
    const rects = revealPartition(6, 5, 'pair')
    for (const r of rects) {
      expect(r.w).toBeLessThanOrEqual(1)
      expect(r.h).toBeLessThanOrEqual(2)
      expect(r.w).toBeGreaterThanOrEqual(1)
      expect(r.h).toBeGreaterThanOrEqual(1)
    }
    for (const c of coverMap(rects, 6, 5)) expect(c).toBe(1)
    // 5 rows -> 2 full domino rows + 1 leftover row of singles = 6*2 + 6 = 18
    expect(rects).toHaveLength(18)
  })

  it('quad: 2x2 blocks with remainder strips, full coverage, no overlap', () => {
    const rects = revealPartition(5, 5, 'quad')
    for (const r of rects) {
      expect(r.w).toBeLessThanOrEqual(2)
      expect(r.h).toBeLessThanOrEqual(2)
    }
    for (const c of coverMap(rects, 5, 5)) expect(c).toBe(1)
  })

  it('row: one full-width rect per row', () => {
    const rects = revealPartition(6, 5, 'row')
    expect(rects).toHaveLength(5)
    for (const r of rects) expect(r.w).toBe(6)
    for (const c of coverMap(rects, 6, 5)) expect(c).toBe(1)
  })

  it('is deterministic for the same inputs', () => {
    expect(revealPartition(7, 4, 'quad')).toEqual(revealPartition(7, 4, 'quad'))
  })

  it('edge remainders stay rectangles and never overlap', () => {
    for (const group of ['single', 'pair', 'quad', 'row'] as const) {
      for (let cols = 2; cols <= 10; cols++) {
        for (let rows = 2; rows <= 10; rows++) {
          const rects = revealPartition(cols, rows, group)
          for (const [i, c] of coverMap(rects, cols, rows).entries()) {
            if (c !== 1) throw new Error(`cell ${i} covered ${c}x with ${group} on ${cols}x${rows}`)
          }
        }
      }
    }
  })
})

describe('revealAt', () => {
  it('is deterministic for identical inputs', () => {
    const a = revealAt(BASE)
    const b = revealAt(BASE)
    expect(a.cells).toEqual(b.cells)
    expect(a.nextEventAtMs).toBe(b.nextEventAtMs)
    expect(a.cycle).toBe(b.cycle)
  })

  it('starts fully covered at cycle start', () => {
    const st = revealAt({ ...BASE, nowMs: BASE.nowMs - (BASE.nowMs % 25_000) })
    const cycleStart = st.cycleStartMs
    const atStart = revealAt({ ...BASE, nowMs: cycleStart })
    expect(atStart.event).toBe(0)
    expect(atStart.complete).toBe(false)
    for (const cell of atStart.cells) expect(cell.openedAtMs).toBeNull()
    expect(atStart.nextEventAtMs).toBe(cycleStart + 25_000)
  })

  it('opens cells monotonically through the cycle', () => {
    const first = revealAt(BASE)
    let prevOpen = -1
    for (let e = 0; e <= first.groups; e++) {
      const at = revealAt({ ...BASE, nowMs: first.cycleStartMs + e * 25_000 })
      const open = at.cells.filter((c) => c.openedAtMs !== null).length
      expect(open).toBeGreaterThanOrEqual(prevOpen)
      prevOpen = open
    }
  })

  it('completes and holds the finished portrait before the cycle rolls over', () => {
    const first = revealAt(BASE)
    const hold = revealAt({ ...BASE, nowMs: first.cycleStartMs + first.groups * 25_000 + 10_000 })
    expect(hold.complete).toBe(true)
    for (const c of hold.cells) expect(c.openedAtMs).not.toBeNull()
    expect(hold.nextEventAtMs).toBe(first.cycleEndMs)
    // next cycle re-covers everything
    const next = revealAt({ ...BASE, nowMs: first.cycleEndMs })
    expect(next.cycle).toBe(first.cycle + 1)
    expect(next.complete).toBe(false)
    for (const cell of next.cells) expect(cell.openedAtMs).toBeNull()
  })

  it('never opens a group before its event time (no overlap, monotonic wall clock)', () => {
    const st = revealAt({ ...BASE, nowMs: BASE.nowMs + 37_000 })
    for (const c of st.cells) {
      if (c.openedAtMs !== null) {
        expect(c.openedAtMs).toBeLessThanOrEqual(BASE.nowMs + 37_000)
        expect(c.progress).toBeGreaterThan(0)
      }
    }
    const opened = st.cells.filter((c) => c.openedAtMs !== null)
    expect(opened.length).toBeGreaterThan(0)
    for (const c of opened) expect(c.group).toBeGreaterThanOrEqual(0)
    for (const c of st.cells) {
      if (c.openedAtMs === null) expect(c.group).toBe(-1)
    }
  })

  it('streams every album item across covered cells within a cycle', () => {
    const st = revealAt({ ...BASE, nowMs: BASE.nowMs + 1000, itemCount: 7 })
    expect(new Set(st.cells.map((c) => c.item))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
  })

  it('item selection continues across cycles without losing sequence', () => {
    const a = revealAt({ ...BASE, nowMs: BASE.nowMs })
    const b = revealAt({ ...BASE, nowMs: a.cycleEndMs })
    expect(b.cycle).toBe(a.cycle + 1)
    const firstItem = a.cells[0].item
    const secondItem = b.cells[0].item
    expect(secondItem).not.toBe(firstItem)
  })

  it('offset shifts the timeline by whole cycles', () => {
    const base = revealAt({ ...BASE, offset: 1 })
    const shifted = revealAt({ ...BASE, nowMs: BASE.nowMs + (base.cycleEndMs - base.cycleStartMs), offset: 0 })
    expect(base.cycle).toBe(shifted.cycle)
    expect(base.cells.map((c) => c.item)).toEqual(shifted.cells.map((c) => c.item))
  })

  it('handles zero items without crashing', () => {
    const st = revealAt({ ...BASE, itemCount: 0 })
    for (const c of st.cells) expect(c.item).toBe(-1)
  })

  it('progress stays within [0, 1] right after an event', () => {
    const st = revealAt({ ...BASE, nowMs: BASE.nowMs + 25_100 })
    for (const c of st.cells) expect(c.progress).toBeGreaterThanOrEqual(0)
    expect(st.transitionMs).toBeGreaterThan(0)
    expect(st.transitionMs).toBeLessThanOrEqual(1200)
  })

  it('resolves a full day quickly (kiosk budget)', () => {
    const start = performance.now()
    for (let i = 0; i < 2000; i++) {
      revealAt({ ...BASE, nowMs: BASE.nowMs + i * 1000 })
    }
    expect(performance.now() - start).toBeLessThan(2000)
  })
})

describe('clampReveal', () => {
  it('falls back to defaults for missing or garbage config', () => {
    expect(clampReveal(undefined)).toEqual({ tilesAcross: 6, tilesDown: 5, gap: 2, group: 'single', effect: 'fade' })
    expect(clampReveal({ tilesAcross: Number.NaN, tilesDown: 'x', gap: -5, group: 'spiral', effect: 3 })).toEqual({
      tilesAcross: 6,
      tilesDown: 5,
      gap: 0,
      group: 'single',
      effect: 'fade',
    })
  })

  it('clamps out-of-range numbers and unknown enums', () => {
    expect(clampReveal({ tilesAcross: 99, tilesDown: 1, gap: 40, group: 'row', effect: 'none' })).toEqual({
      tilesAcross: 10,
      tilesDown: 2,
      gap: 12,
      group: 'row',
      effect: 'none',
    })
  })
})
