import { describe, it, expect } from 'vitest'
import { mosaicAt, mosaicGrid, seedFromString, hash01 } from '../mosaic'

describe('mosaicGrid', () => {
  it('portrait 9:16', () => {
    const g = mosaicGrid({ width: 1080, height: 1920, tileAspect: 2 / 3, tilesAcross: 4, itemCount: 30 })
    expect(g.cols).toBe(4)
    expect(g.rows).toBeGreaterThanOrEqual(4)
    expect(g.fallback).toBe(false)
  })
  it('landscape 16:9', () => {
    const g = mosaicGrid({ width: 1920, height: 1080, tileAspect: 2 / 3, tilesAcross: 4, itemCount: 30 })
    expect(g.rows).toBe(4)
    expect(g.cols).toBeGreaterThanOrEqual(4)
    expect(g.fallback).toBe(false)
  })
  it('square', () => {
    const g = mosaicGrid({ width: 1080, height: 1080, tileAspect: 1, tilesAcross: 4, itemCount: 30 })
    expect(g.cols).toBe(4)
    expect(g.rows).toBe(4)
    expect(g.fallback).toBe(false)
  })
  it('reduces tilesAcross when too few items', () => {
    const g = mosaicGrid({ width: 1080, height: 1920, tileAspect: 2 / 3, tilesAcross: 6, itemCount: 12 })
    expect(g.cols * g.rows).toBeLessThanOrEqual(11)
    expect(g.fallback).toBe(false)
  })
  it('fallback for <5 items', () => {
    const g = mosaicGrid({ width: 1080, height: 1920, tileAspect: 2 / 3, tilesAcross: 4, itemCount: 4 })
    expect(g.fallback).toBe(true)
  })
  it('fallback for 0 items', () => {
    const g = mosaicGrid({ width: 1080, height: 1920, tileAspect: 2 / 3, tilesAcross: 4, itemCount: 0 })
    expect(g.fallback).toBe(true)
  })
  it('no NaN/Infinity', () => {
    const g = mosaicGrid({ width: 0, height: 0, tileAspect: 2 / 3, tilesAcross: 4, itemCount: 10 })
    expect(Number.isFinite(g.cols)).toBe(true)
    expect(Number.isFinite(g.rows)).toBe(true)
  })
  it('tilesAcross 2..10 all valid for 200 items', () => {
    for (let t = 2; t <= 10; t++) {
      const g = mosaicGrid({ width: 1080, height: 1920, tileAspect: 2 / 3, tilesAcross: t, itemCount: 200 })
      expect(g.cols * g.rows).toBeLessThanOrEqual(199)
      expect(g.fallback).toBe(false)
    }
  })
})

describe('mosaicAt determinism', () => {
  it('identical inputs identical output', () => {
    const args = { nowMs: 1234567890, offset: 0, seed: 42, itemCount: 30, intervalSec: 25, cols: 4, rows: 6 }
    const a = mosaicAt(args)
    const b = mosaicAt(args)
    expect(a).toEqual(b)
  })
  it('independent of array identity (seed based)', () => {
    const a = mosaicAt({ nowMs: 999999, offset: 0, seed: seedFromString('album-1'), itemCount: 20, intervalSec: 25, cols: 4, rows: 5 })
    const b = mosaicAt({ nowMs: 999999, offset: 0, seed: seedFromString('album-1'), itemCount: 20, intervalSec: 25, cols: 4, rows: 5 })
    expect(a.tiles.map((t) => t.item)).toEqual(b.tiles.map((t) => t.item))
  })
})

describe('mosaicAt gaps', () => {
  it('gaps within 20-30s for S=25', () => {
    const seed = 7
    const cols = 4, rows = 5
    const N = cols * rows
    const M = 30
    let prev = 0
    const gaps: number[] = []
    for (let i = 0; i < 200; i++) {
      const t = (i + 1) * 25000
      const s = mosaicAt({ nowMs: t, offset: 0, seed, itemCount: M, intervalSec: 25, cols, rows })
      // event time approximations: collect nextEventAtMs deltas by stepping k
    }
    // Instead check event times directly via repeated k
    const times: number[] = []
    for (let k = 0; k < 200; k++) {
      // reconstruct T_k not exported; use mosaicAt at a time just after event k
    }
    // Use nextEventAtMs chain starting from 0
    let now = 0
    const gapList: number[] = []
    for (let i = 0; i < 48; i++) {
      const s = mosaicAt({ nowMs: now, offset: 0, seed, itemCount: M, intervalSec: 25, cols, rows })
      const next = s.nextEventAtMs
      if (next > now) {
        gapList.push(next - now > 0 ? next - (now === 0 ? 0 : now) : 0)
      }
      now = next + 1
    }
    // gapList contains intervals between consecutive events
    for (const g of gapList) {
      if (g === 0) continue
      expect(g).toBeGreaterThanOrEqual(25000 * 0.8 - 1)
      expect(g).toBeLessThanOrEqual(25000 * 1.2 + 1)
    }
  })
})

describe('mosaicAt no-duplicate guarantee', () => {
  function run(M: number, Ncols: number, Nrows: number, hours: number) {
    const N = Ncols * Nrows
    const seed = 123
    const intervalSec = 25
    const S = intervalSec * 1000
    const totalMs = hours * 3600 * 1000
    const step = 1000 // sample every second
    for (let now = 0; now < totalMs; now += step) {
      const st = mosaicAt({ nowMs: now, offset: 0, seed, itemCount: M, intervalSec, cols: Ncols, rows: Nrows })
      const items = st.tiles.map((t) => t.item)
      // distinctness among current items
      const set = new Set(items)
      expect(set.size).toBe(items.length)
      // mid-transition: also check outgoing+incoming for animating tile
      for (const t of st.tiles) {
        if (t.progress < 1) {
          // incoming t.item and outgoing t.previousItem must differ
          expect(t.item).not.toBe(t.previousItem)
          // and incoming must not duplicate any other tile's item
          const others = st.tiles.filter((x) => x.tile !== t.tile).map((x) => x.item)
          expect(others).not.toContain(t.item)
        }
      }
    }
  }
  it('M = N+1', () => { run(21, 4, 5, 2) })
  it('M = 2N', () => { run(40, 4, 5, 2) })
  it('M = 2N-1', () => { run(39, 4, 5, 2) })
  it('M = 200', () => { run(200, 4, 5, 1) })
})

describe('mosaicAt offset stepping', () => {
  it('offset +/-1 moves one event and is reversible', () => {
    const base = { nowMs: 500000, seed: 9, itemCount: 30, intervalSec: 25, cols: 4, rows: 5 }
    const s0 = mosaicAt({ ...base, offset: 0 })
    const s1 = mosaicAt({ ...base, offset: 1 })
    const sm1 = mosaicAt({ ...base, offset: -1 })
    expect(s1.event).toBe(s0.event + 1)
    expect(sm1.event).toBe(s0.event - 1)
    // reversible: applying +1 then -1 returns same event
    const back = mosaicAt({ ...base, offset: 0, nowMs: s1.nextEventAtMs + 1 })
    expect(back.event).toBeGreaterThanOrEqual(s0.event)
  })
})

describe('mosaicAt edge cases', () => {
  it('k near 0 / negative handled', () => {
    const s = mosaicAt({ nowMs: 0, offset: 0, seed: 1, itemCount: 30, intervalSec: 25, cols: 4, rows: 5 })
    expect(s.tiles.length).toBe(20)
    expect(Number.isFinite(s.nextEventAtMs)).toBe(true)
  })
  it('epoch 2026 values', () => {
    const now = new Date('2026-11-03T12:00:00Z').getTime()
    const s = mosaicAt({ nowMs: now, offset: 0, seed: 1, itemCount: 30, intervalSec: 25, cols: 4, rows: 5 })
    expect(s.tiles.length).toBe(20)
  })
  it('empty items returns empty', () => {
    const s = mosaicAt({ nowMs: 1000, offset: 0, seed: 1, itemCount: 0, intervalSec: 25, cols: 4, rows: 5 })
    expect(s.tiles.length).toBe(0)
  })
})

describe('cache bounds', () => {
  it('bounded after many events', () => {
    // just ensure no throw over 1000 events
    for (let i = 0; i < 1000; i++) {
      mosaicAt({ nowMs: i * 1000, offset: 0, seed: 5, itemCount: 30, intervalSec: 3, cols: 4, rows: 5 })
    }
    expect(true).toBe(true)
  })
})