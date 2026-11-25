import type { PongConfig } from '@/lib/types'
import { clamp, fold, lerp, smoothstep } from '@/lib/canvas/math'
import { hash01, sampleInt } from '@/lib/canvas/prng'
import type { SceneStateContext } from './types'

export type PongAxis = 'horizontal' | 'vertical'

export type PongTiming = {
  axis: PongAxis
  A: number
  B: number
  xL: number
  xR: number
  D: number
  O: number
  Rb: number
  bs: number
  pointSec: number
  flightSec: number
  serveDelaySec: number
  pauseSec: number
  matchSlots: number
}

export type PongPointPlan = {
  server: 0 | 1
  winner: 0 | 1
  loser: 0 | 1
  n: number
  vu: number
  vv: number
  tau: number
  missTau: number
  phi: number
  ballTop0: number
  serveDelaySec: number
}

export type PongState = {
  phase: 'serve' | 'flight' | 'pause' | 'banner'
  ball: { x: number; y: number; visible: boolean }
  paddles: [number, number]
  score: [number, number]
  banner: string | null
  axis: PongAxis
}

type PaddleEvent = { t: number; y: number }

export function pongTiming(config: PongConfig, bounds: { width: number; height: number }): PongTiming {
  const axis: PongAxis =
    config.axis === 'auto' ? (bounds.width >= bounds.height ? 'horizontal' : 'vertical') : config.axis
  const A = axis === 'horizontal' ? bounds.width : bounds.height
  const B = axis === 'horizontal' ? bounds.height : bounds.width
  const xL = config.paddle.inset + config.paddle.w
  const xR = A - config.paddle.inset - config.paddle.w
  const D = Math.max(1, xR - xL - config.ballSize)
  const O = config.paddle.inset + config.paddle.w + config.ballSize
  const Rb = Math.max(1, B - config.ballSize)
  const avgHits = (config.rallyHits[0] + config.rallyHits[1]) / 2
  const fixed = (config.serveDelayMs + config.pointPauseMs) / 1000
  const pointSec = Math.min(60, Math.max(4, fixed + 0.1, fixed + (avgHits * D + O) / config.baseSpeed))

  return {
    axis,
    A,
    B,
    xL,
    xR,
    D,
    O,
    Rb,
    bs: config.ballSize,
    pointSec,
    flightSec: pointSec - fixed,
    serveDelaySec: config.serveDelayMs / 1000,
    pauseSec: config.pointPauseMs / 1000,
    matchSlots: config.pointsPerMatch + 1,
  }
}

function face(timing: PongTiming, side: 0 | 1): number {
  return side === 0 ? timing.xL : timing.xR
}

function restY(seed: number, matchIndex: number, k: number, side: 0 | 1, timing: PongTiming, config: PongConfig): number {
  const center = (timing.B - config.paddle.h) / 2
  const spread = (hash01(seed, matchIndex * 211 + k * 19 + side + 6) - 0.5) * 0.4 * (timing.B - config.paddle.h)
  return clamp(center + spread, 0, timing.B - config.paddle.h)
}

export function pointPlan(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
): PongPointPlan {
  const timing = pongTiming(config, bounds)
  const server = (k % 2) as 0 | 1
  const winner = (hash01(seed, matchIndex * 131 + k * 17 + 3) < 0.5 ? 0 : 1) as 0 | 1
  const loser = (1 - winner) as 0 | 1
  const wantParity = loser === 1 - server ? 1 : 0
  const candidates: number[] = []
  for (let n = config.rallyHits[0]; n <= config.rallyHits[1]; n += 1) {
    if (n % 2 === wantParity) candidates.push(n)
  }
  const n =
    candidates.length > 0
      ? candidates[sampleInt(seed, matchIndex * 131 + k * 17 + 4, 0, candidates.length - 1)]
      : config.rallyHits[0]
  const vu = (n * timing.D + timing.O) / timing.flightSec
  const degrees = 8 + hash01(seed, matchIndex * 97 + k * 13 + 1) * 24
  const sign = hash01(seed, matchIndex * 97 + k * 13 + 2) < 0.5 ? -1 : 1
  const phi = (degrees * Math.PI * sign) / 180
  const vv = vu * Math.tan(phi)
  const ballTop0 = 0.15 * timing.Rb + hash01(seed, matchIndex * 131 + k * 17 + 5) * 0.7 * timing.Rb

  return {
    server, winner, loser, n, vu, vv,
    tau: timing.D / vu,
    missTau: (timing.D + timing.O) / vu,
    phi, ballTop0, serveDelaySec: timing.serveDelaySec,
  }
}

function missAt(plan: PongPointPlan): number {
  return plan.serveDelaySec + (plan.n - 1) * plan.tau + plan.missTau
}

function ballCenterAt(plan: PongPointPlan, timing: PongTiming, s: number): { x: number; y: number } {
  const a = Math.max(0, s - plan.serveDelaySec)
  const rallyEnd = (plan.n - 1) * plan.tau
  const j = a < rallyEnd ? Math.floor(a / plan.tau) + 1 : plan.n
  const legStart = (j - 1) * plan.tau
  const legTau = j === plan.n ? plan.missTau : plan.tau
  const q = clamp(a - legStart, 0, legTau)
  const start = j % 2 === 1 ? face(timing, plan.server) : face(timing, (1 - plan.server) as 0 | 1)
  const direction = (j % 2 === 1) === (plan.server === 0) ? 1 : -1
  const distance = j < plan.n ? timing.D : timing.D + timing.O
  return {
    x: start + direction * distance * (q / legTau),
    y: fold(plan.ballTop0 + plan.vv * a, timing.Rb) + timing.bs / 2,
  }
}

function startPositions(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  slotIndex: number,
): [number, number] {
  const timing = pongTiming(config, bounds)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const center = (timing.B - config.paddle.h) / 2
  if (k === config.pointsPerMatch) return [center, center]

  const plan = pointPlan(config, bounds, seed, matchIndex, k)
  const serverY = clamp(plan.ballTop0 + timing.bs / 2 - config.paddle.h / 2, 0, timing.B - config.paddle.h)
  const receiverSide = (1 - plan.server) as 0 | 1
  const receiverY = restY(seed, matchIndex, k, receiverSide, timing, config)
  return plan.server === 0 ? [serverY, receiverY] : [receiverY, serverY]
}

function track(events: PaddleEvent[], s: number, timing: PongTiming, config: PongConfig): number {
  if (events.length === 0) return (timing.B - config.paddle.h) / 2
  if (s <= events[0].t) return events[0].y
  for (let index = 1; index < events.length; index++) {
    const a = events[index - 1]
    const b = events[index]
    if (s <= b.t) {
      const span = b.t - a.t
      if (span <= 1e-9) return b.y
      const moveAt = a.t + 0.25 * span
      if (s <= moveAt) return a.y
      return lerp(a.y, b.y, smoothstep((s - moveAt) / (b.t - moveAt)))
    }
  }
  return events[events.length - 1].y
}

function missY(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
  ballCenterY: number,
): number {
  const timing = pongTiming(config, bounds)
  const base = ballCenterY - config.paddle.h / 2
  const offset = 0.75 * config.paddle.h + config.ballSize / 2 + 30 + 40 * hash01(seed, matchIndex * 131 + k * 17 + 7)
  const sign = hash01(seed, matchIndex * 131 + k * 17 + 8) < 0.5 ? -1 : 1
  const optionA = clamp(base + sign * offset, 0, timing.B - config.paddle.h)
  const optionB = clamp(base - sign * offset, 0, timing.B - config.paddle.h)
  const separationA = Math.abs(optionA + config.paddle.h / 2 - ballCenterY)
  const separationB = Math.abs(optionB + config.paddle.h / 2 - ballCenterY)
  return separationA >= separationB ? optionA : optionB
}

function paddlePositions(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  slotIndex: number,
  s: number,
): [number, number] {
  const timing = pongTiming(config, bounds)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const center = (timing.B - config.paddle.h) / 2
  const nextStart = startPositions(config, bounds, seed, slotIndex + 1)

  if (k === config.pointsPerMatch) {
    const easeStart = timing.pointSec - timing.pauseSec
    const p = clamp((s - easeStart) / Math.max(0.001, timing.pauseSec), 0, 1)
    return [lerp(center, nextStart[0], smoothstep(p)), lerp(center, nextStart[1], smoothstep(p))]
  }

  const plan = pointPlan(config, bounds, seed, matchIndex, k)
  const start = startPositions(config, bounds, seed, slotIndex)
  const events: [PaddleEvent[], PaddleEvent[]] = [[{ t: 0, y: start[0] }], [{ t: 0, y: start[1] }]]

  for (let j = 1; j < plan.n; j++) {
    const receiver = (j % 2 === 1 ? 1 - plan.server : plan.server) as 0 | 1
    const hitAt = plan.serveDelaySec + j * plan.tau
    const centerY = ballCenterAt(plan, timing, hitAt).y
    events[receiver].push({ t: hitAt, y: clamp(centerY - config.paddle.h / 2, 0, timing.B - config.paddle.h) })
  }

  const miss = missAt(plan)
  const missCenter = ballCenterAt(plan, timing, miss).y
  events[plan.loser].push({ t: miss, y: missY(config, bounds, seed, matchIndex, k, missCenter) })

  const pauseStart = plan.serveDelaySec + timing.flightSec
  if (s <= pauseStart) {
    return [track(events[0], s, timing, config), track(events[1], s, timing, config)]
  }

  const p = clamp((s - pauseStart) / Math.max(0.001, timing.pauseSec), 0, 1)
  return [
    lerp(track(events[0], pauseStart, timing, config), nextStart[0], smoothstep(p)),
    lerp(track(events[1], pauseStart, timing, config), nextStart[1], smoothstep(p)),
  ]
}

function addWinner(score: [number, number], winner: 0 | 1): void {
  score[winner] += 1
}

function scoreFor(
  config: PongConfig,
  bounds: { width: number; height: number },
  seed: number,
  matchIndex: number,
  k: number,
  s: number,
  plan: PongPointPlan,
): [number, number] {
  const score: [number, number] = [0, 0]
  for (let i = 0; i < k; i++) addWinner(score, pointPlan(config, bounds, seed, matchIndex, i).winner)
  if (s >= missAt(plan)) addWinner(score, plan.winner)
  return score
}

export function pongState(config: PongConfig, ctx: SceneStateContext): PongState {
  const timing = pongTiming(config, ctx.bounds)
  const t = Math.max(0, ctx.tMs / 1000)
  const slotIndex = Math.floor(t / timing.pointSec)
  const matchIndex = Math.floor(slotIndex / timing.matchSlots)
  const k = slotIndex % timing.matchSlots
  const s = t - slotIndex * timing.pointSec
  const paddles = paddlePositions(config, ctx.bounds, ctx.seed, slotIndex, s)

  if (k === config.pointsPerMatch) {
    const score: [number, number] = [0, 0]
    for (let i = 0; i < config.pointsPerMatch; i++) {
      addWinner(score, pointPlan(config, ctx.bounds, ctx.seed, matchIndex, i).winner)
    }
    const banner = score[0] === score[1] ? 'DRAW' : score[0] > score[1] ? 'LEFT WINS' : 'RIGHT WINS'
    return { phase: 'banner', ball: { x: 0, y: 0, visible: false }, paddles, score, banner, axis: timing.axis }
  }

  const plan = pointPlan(config, ctx.bounds, ctx.seed, matchIndex, k)
  const phase: PongState['phase'] =
    s < plan.serveDelaySec ? 'serve' : s < plan.serveDelaySec + timing.flightSec ? 'flight' : 'pause'
  const center = ballCenterAt(plan, timing, s)
  const ball =
    phase === 'serve'
      ? { x: face(timing, plan.server), y: plan.ballTop0 + timing.bs / 2, visible: true }
      : { x: center.x, y: center.y, visible: phase === 'flight' }

  return {
    phase,
    ball,
    paddles,
    score: scoreFor(config, ctx.bounds, ctx.seed, matchIndex, k, s, plan),
    banner: null,
    axis: timing.axis,
  }
}
