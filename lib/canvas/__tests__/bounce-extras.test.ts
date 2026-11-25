import { describe, expect, it } from 'vitest'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { bounceState } from '@/lib/canvas/scenes/bounce'
import type { BounceConfig } from '@/lib/types'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: BounceConfig = {
  logo: { kind: 'text', text: 'DVD', shape: 'ellipse', style, w: 100, h: 100 },
  speed: 1000,
  angleDeg: 30,
  startMode: 'center',
  tint: { mode: 'none', colors: ['#ff0000'], fixed: '#ffffff' },
  cornerCelebration: true,
  trail: { enabled: true, length: 3, spacingMs: 100 },
  guaranteedCorner: true,
}

const geometry = resolveGeometry({
  arrangement: 'row', gap: 0, align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const ctx = { bounds: { width: 1000, height: 500 }, geometry, seed: 2 }

describe('bounce extras', () => {
  it('reaches a corner at the analytic time in guaranteed-corner mode', () => {
    const seconds = Math.hypot(1000 - 100, 500 - 100) / 1000
    const state = bounceState(config, { ...ctx, tMs: seconds * 1000 })
    expect(state.cornerAgeMs).not.toBeNull()
    expect(state.cornerAgeMs!).toBeLessThan(2)
  })

  it('marks a finished trail without reading history', () => {
    const state = bounceState(config, { ...ctx, tMs: 2000 })
    expect(state.trailFinished).toBe(true)
    expect(state.trail).toHaveLength(3)
  })

  it('keeps the scene slot-independent', () => {
    const a = bounceState(config, { ...ctx, tMs: 900 })
    const b = bounceState(config, { ...ctx, tMs: 900 })
    expect(a).toEqual(b)
  })
})
