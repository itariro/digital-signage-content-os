import { describe, expect, it } from 'vitest'
import type { PongConfig } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { pointPlan, pongState, pongTiming } from '@/lib/canvas/scenes/pong'

const style = {
  fontFamily: 'bebas', fontWeight: 700, letterSpacing: 0, align: 'center' as const,
  color: '#ffffff', accent: '#ffffff', bg: '#000000', bgOpacity: 0, blur: 0,
  radius: 0, stroke: '#000000', strokeWidth: 0, textStroke: 0, opacity: 100, shadow: false,
}

const config: PongConfig = {
  axis: 'auto',
  paddle: { w: 24, h: 220, inset: 40 },
  ballSize: 28,
  baseSpeed: 900,
  rallyHits: [2, 7],
  pointsPerMatch: 7,
  serveDelayMs: 900,
  pointPauseMs: 1200,
  showScore: true,
  colors: { ball: '#ffffff', paddles: '#ffffff', net: '#475569', text: '#ffffff' },
  scoreStyle: style,
}

const row = resolveGeometry({
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const column = resolveGeometry({
  arrangement: 'column', gap: 0, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
})
const bounds = { width: row.width, height: row.height }
const columnBounds = { width: column.width, height: column.height }

describe('pongTiming', () => {
  it('derives a bounded point duration and flight time', () => {
    const timing = pongTiming(config, bounds)
    expect(timing.pointSec).toBeGreaterThanOrEqual(4)
    expect(timing.pointSec).toBeLessThanOrEqual(60)
    expect(timing.flightSec).toBeGreaterThan(0)
    expect(timing.matchSlots).toBe(8)
  })

  it('plays along the longer dimension for auto', () => {
    expect(pongTiming(config, bounds).axis).toBe('horizontal')
    expect(pongTiming(config, columnBounds).axis).toBe('vertical')
    expect(pongTiming({ ...config, axis: 'vertical' }, bounds).axis).toBe('vertical')
    expect(pongTiming({ ...config, axis: 'horizontal' }, columnBounds).axis).toBe('horizontal')
  })
})

describe('pointPlan', () => {
  it('chooses a rally length with the right parity for the loser', () => {
    for (let k = 0; k < 7; k++) {
      const plan = pointPlan(config, bounds, 5, 0, k)
      const receiverOfFinal = plan.n % 2 === 1 ? 1 - plan.server : plan.server
      expect(receiverOfFinal).toBe(plan.loser)
      expect(plan.n).toBeGreaterThanOrEqual(config.rallyHits[0])
      expect(plan.n).toBeLessThanOrEqual(config.rallyHits[1])
    }
  })

  it('is deterministic', () => {
    expect(pointPlan(config, bounds, 5, 0, 3)).toEqual(pointPlan(config, bounds, 5, 0, 3))
  })
})

describe('pongState', () => {
  it('returns finite values for a day of play', () => {
    for (let k = 0; k < 20_000; k++) {
      const state = pongState(config, { bounds, geometry: row, tMs: (k * 977) % 86_400_000, seed: 5 })
      expect(Number.isFinite(state.ball.x)).toBe(true)
      expect(Number.isFinite(state.ball.y)).toBe(true)
      expect(Number.isFinite(state.paddles[0])).toBe(true)
      expect(Number.isFinite(state.paddles[1])).toBe(true)
    }
  })

  it('keeps paddles inside the field and the ball inside the cross axis', () => {
    const timing = pongTiming(config, bounds)
    for (let k = 0; k < 5_000; k++) {
      const state = pongState(config, { bounds, geometry: row, tMs: k * 370, seed: 5 })
      expect(state.paddles[0]).toBeGreaterThanOrEqual(0)
      expect(state.paddles[0]).toBeLessThanOrEqual(timing.B - config.paddle.h)
      expect(state.paddles[1]).toBeGreaterThanOrEqual(0)
      expect(state.paddles[1]).toBeLessThanOrEqual(timing.B - config.paddle.h)
      if (state.ball.visible) {
        expect(state.ball.y).toBeGreaterThanOrEqual(config.ballSize / 2 - 1e-6)
        expect(state.ball.y).toBeLessThanOrEqual(timing.B - config.ballSize / 2 + 1e-6)
      }
    }
  })

  it('serves from the ball-center contact position on each paddle', () => {
    const timing = pongTiming(config, bounds)
    const first = pongState(config, { bounds, geometry: row, tMs: 0, seed: 5 })
    const second = pongState(config, { bounds, geometry: row, tMs: timing.pointSec * 1000, seed: 5 })
    expect(first.ball.x).toBeCloseTo(timing.xL + timing.bs / 2, 6)
    expect(second.ball.x).toBeCloseTo(timing.xR - timing.bs / 2, 6)
    expect((timing.xR - timing.bs / 2) - (timing.xL + timing.bs / 2)).toBeCloseTo(timing.D, 6)
  })

  it('lands the ball within half a paddle at every hit and outside it at the miss', () => {
    const timing = pongTiming(config, bounds)
    const k = 2
    const slotStart = k * timing.pointSec
    const plan = pointPlan(config, bounds, 5, 0, k)
    const missS = plan.serveDelaySec + (plan.n - 1) * plan.tau + plan.missTau
    expect(missS).toBeCloseTo(plan.serveDelaySec + timing.flightSec, 6)
    for (let j = 1; j <= plan.n; j++) {
      const s = j < plan.n ? plan.serveDelaySec + j * plan.tau : missS
      const state = pongState(config, { bounds, geometry: row, tMs: (slotStart + s) * 1000, seed: 5 })
      const receiverSide = j % 2 === 1 ? 1 - plan.server : plan.server
      const paddleCenter = state.paddles[receiverSide] + config.paddle.h / 2
      if (j < plan.n) {
        expect(Math.abs(state.ball.y - paddleCenter)).toBeLessThanOrEqual(config.paddle.h / 2 + 1e-6)
      } else {
        expect(Math.abs(state.ball.y - paddleCenter)).toBeGreaterThan(config.paddle.h / 2)
      }
      expect(s).toBeLessThan(timing.pointSec)
    }
  })

  it('keeps scores monotonic inside a match, shows a banner and resets', () => {
    const timing = pongTiming(config, bounds)
    let previous = -1
    for (let t = 0; t < timing.pointSec * timing.matchSlots; t += 0.1) {
      const state = pongState(config, { bounds, geometry: row, tMs: t * 1000, seed: 5 })
      expect(state.score[0] + state.score[1]).toBeGreaterThanOrEqual(previous)
      previous = state.score[0] + state.score[1]
    }
    const banner = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec * config.pointsPerMatch + 0.5) * 1000, seed: 5 })
    expect(banner.phase).toBe('banner')
    expect(banner.banner).toMatch(/WINS|DRAW/)
    expect(banner.score[0] + banner.score[1]).toBe(config.pointsPerMatch)
    const nextMatch = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec * timing.matchSlots + 0.1) * 1000, seed: 5 })
    expect(nextMatch.score).toEqual([0, 0])
  })

  it('is continuous across a slot boundary', () => {
    const timing = pongTiming(config, bounds)
    const before = pongState(config, { bounds, geometry: row, tMs: (timing.pointSec - 0.001) * 1000, seed: 5 })
    const after = pongState(config, { bounds, geometry: row, tMs: timing.pointSec * 1000 + 1, seed: 5 })
    expect(Math.abs(before.paddles[0] - after.paddles[0])).toBeLessThan(2)
    expect(Math.abs(before.paddles[1] - after.paddles[1])).toBeLessThan(2)
  })

  it('is slot independent and reports the vertical axis for a column canvas', () => {
    expect(pongState(config, { bounds, geometry: row, tMs: 12_345, seed: 5 })).toEqual(
      pongState(config, { bounds, geometry: row, tMs: 12_345, seed: 5 }),
    )
    expect(pongState(config, { bounds: columnBounds, geometry: column, tMs: 12_345, seed: 5 }).axis).toBe('vertical')
  })
})
