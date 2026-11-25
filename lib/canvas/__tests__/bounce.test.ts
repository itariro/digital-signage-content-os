import { describe, expect, it } from 'vitest'
import type { BounceConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { bounceState, bouncePosition } from '@/lib/canvas/scenes/bounce'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: BounceConfig = {
  logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style, w: 100, h: 100 },
  speed: 900,
  angleDeg: 45,
  startMode: 'center',
  tint: { mode: 'cycle', colors: ['#ff0000', '#00ff00', '#0000ff'], fixed: '#ffffff' },
  cornerCelebration: true,
  trail: { enabled: false, length: 0, spacingMs: 80 },
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})

const bounds = { width: 1000, height: 1000 }
const ctx = { bounds, geometry, tMs: 0, seed: 11 }

describe('bouncePosition', () => {
  it('stays inside the usable range for many timestamps', () => {
    for (let k = 0; k < 20_000; k++) {
      const t = (k * 0.731) % 20_000
      const position = bouncePosition(config, bounds, t, 11)
      expect(position.x).toBeGreaterThanOrEqual(0)
      expect(position.x).toBeLessThanOrEqual(900)
      expect(position.y).toBeGreaterThanOrEqual(0)
      expect(position.y).toBeLessThanOrEqual(900)
    }
  })

  it('is deterministic and finite after a day', () => {
    expect(bouncePosition(config, bounds, 3.5, 11)).toEqual(bouncePosition(config, bounds, 3.5, 11))
    const late = bouncePosition(config, bounds, 86_400, 11)
    expect(Number.isFinite(late.x)).toBe(true)
    expect(Number.isFinite(late.y)).toBe(true)
    expect(late.bounces).toBeGreaterThan(0)
  })

  it('counts bounces monotonically', () => {
    expect(bouncePosition(config, bounds, 10, 11).bounces).toBeGreaterThanOrEqual(bouncePosition(config, bounds, 1, 11).bounces)
  })
})

describe('bounceState', () => {
  it('detects the first corner hit for a centred 45 degree logo', () => {
    const state = bounceState(config, { ...ctx, tMs: (900 / (900 * Math.cos(Math.PI / 4))) / 2 * 1000 })
    expect(state.cornerAgeMs).not.toBeNull()
    expect(state.cornerAgeMs!).toBeLessThan(1)
  })

  it('cycles the tint on every bounce', () => {
    const a = bounceState(config, { ...ctx, tMs: 0 })
    const b = bounceState(config, { ...ctx, tMs: 2_000 })
    expect(a.color).not.toBeNull()
    expect(b.color).not.toBeNull()
    expect(a.color).not.toBe(b.color)
  })

  it('produces an analytic trail without history', () => {
    const trail = { ...config, trail: { enabled: true, length: 4, spacingMs: 100 } }
    const state = bounceState(trail, { ...ctx, tMs: 3_000 })
    const late = bounceState(trail, { ...ctx, tMs: 30_000 })
    expect(state.trail).toHaveLength(4)
    expect(late.trail).toEqual(
      [400, 300, 200, 100].map((ms) => {
        const point = bouncePosition(trail, bounds, 30 - ms / 1000, 11)
        return { x: point.x, y: point.y }
      }),
    )
  })

  it('is slot independent', () => {
    expect(bounceState(config, { ...ctx, tMs: 5_000 })).toEqual(bounceState(config, { ...ctx, tMs: 5_000 }))
  })
})
