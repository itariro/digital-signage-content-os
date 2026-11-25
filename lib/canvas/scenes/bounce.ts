import type { BounceConfig } from '@/lib/types'
import { fold } from '@/lib/canvas/math'
import { hash01, pickIndex } from '@/lib/canvas/prng'
import type { SceneStateContext } from './types'

export type BouncePosition = {
  x: number
  y: number
  bounces: number
  hitsX: number
  hitsY: number
  ux: number
  uy: number
  left: number
  top: number
}

export type BounceState = {
  x: number
  y: number
  w: number
  h: number
  bounces: number
  color: string | null
  cornerAgeMs: number | null
  trail: { x: number; y: number }[]
}

function motion(speed: number, u0: number, range: number, seconds: number) {
  const u = u0 + speed * seconds
  const hits = Math.floor(u / range) - Math.floor(u0 / range)
  return { u, position: fold(u, range), hits }
}

/**
 * Analytic DVD bounce. `tSec` is scene-local seconds; the same inputs always
 * produce the same position, so every frame agrees without any history.
 */
export function bouncePosition(config: BounceConfig, bounds: { width: number; height: number }, tSec: number, seed: number): BouncePosition {
  const w = config.logo.w
  const h = config.logo.h
  const rx = Math.max(1, bounds.width - w)
  const ry = Math.max(1, bounds.height - h)
  const angle = ((config.angleDeg ?? 20 + hash01(seed, 1) * 50) * Math.PI) / 180
  const sx = hash01(seed, 2) < 0.5 ? -1 : 1
  const sy = hash01(seed, 3) < 0.5 ? -1 : 1
  const vx = Math.abs(config.speed * Math.cos(angle))
  const vy = Math.abs(config.speed * Math.sin(angle))
  const startX = config.startMode === 'center' ? rx / 2 : hash01(seed, 4) * rx
  const startY = config.startMode === 'center' ? ry / 2 : hash01(seed, 5) * ry
  const u0x = sx > 0 ? startX : 2 * rx - startX
  const u0y = sy > 0 ? startY : 2 * ry - startY
  const mx = motion(vx, u0x, rx, tSec)
  const my = motion(vy, u0y, ry, tSec)

  return {
    x: mx.position,
    y: my.position,
    bounces: mx.hits + my.hits,
    hitsX: mx.hits,
    hitsY: my.hits,
    ux: mx.u,
    uy: my.u,
    left: u0x,
    top: u0y,
  }
}

function lastHitSeconds(u: number, u0: number, range: number, speed: number): number | null {
  const hit = Math.floor(u / range)
  if (hit < 1) return null
  return (hit * range - u0) / speed
}

export function bounceState(config: BounceConfig, ctx: SceneStateContext): BounceState {
  const tSec = Math.max(0, ctx.tMs / 1000)
  const position = bouncePosition(config, ctx.bounds, tSec, ctx.seed)
  const colors = config.tint.colors
  const base = pickIndex(ctx.seed, 9, Math.max(1, colors.length))
  const color =
    config.tint.mode === 'cycle'
      ? colors[(base + position.bounces) % colors.length] ?? null
      : config.tint.mode === 'fixed'
        ? config.tint.fixed
        : null

  const rx = Math.max(1, ctx.bounds.width - config.logo.w)
  const ry = Math.max(1, ctx.bounds.height - config.logo.h)
  const angle = ((config.angleDeg ?? 20 + hash01(ctx.seed, 1) * 50) * Math.PI) / 180
  const vx = Math.abs(config.speed * Math.cos(angle))
  const vy = Math.abs(config.speed * Math.sin(angle))
  const tx = lastHitSeconds(position.ux, position.left, rx, vx)
  const ty = lastHitSeconds(position.uy, position.top, ry, vy)
  let cornerAgeMs: number | null = null
  if (tx !== null && ty !== null) {
    const hitAt = Math.max(tx, ty)
    if (Math.abs(tx - ty) <= 0.04 && hitAt >= 0) cornerAgeMs = Math.max(0, (tSec - hitAt) * 1000)
  }

  const trail = config.trail.enabled
    ? Array.from({ length: config.trail.length }, (_, index) => {
        const t = Math.max(0, tSec - ((config.trail.length - index) * config.trail.spacingMs) / 1000)
        const point = bouncePosition(config, ctx.bounds, t, ctx.seed)
        return { x: point.x, y: point.y }
      })
    : []

  return { x: position.x, y: position.y, w: config.logo.w, h: config.logo.h, bounces: position.bounces, color, cornerAgeMs, trail }
}
