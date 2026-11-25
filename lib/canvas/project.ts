import type { PongConfig } from '@/lib/types'

export type Rect = { x: number; y: number; w: number; h: number }
export type PongAxis = 'horizontal' | 'vertical'

/** Map a court coordinate (along the play axis, across it) onto canvas x/y. */
export function projectRect(axis: PongAxis, along: number, cross: number, alongSize: number, crossSize: number): Rect {
  return axis === 'horizontal'
    ? { x: along, y: cross, w: alongSize, h: crossSize }
    : { x: cross, y: along, w: crossSize, h: alongSize }
}

export function pongPaddleRect(
  axis: PongAxis,
  side: 0 | 1,
  paddle: PongConfig['paddle'],
  crossTop: number,
  bounds: { width: number; height: number },
): Rect {
  const along = axis === 'horizontal' ? bounds.width : bounds.height
  const start = side === 0 ? paddle.inset : along - paddle.inset - paddle.w
  return projectRect(axis, start, crossTop, paddle.w, paddle.h)
}

export function pongBallRect(axis: PongAxis, ball: { x: number; y: number }, size: number): Rect {
  return projectRect(axis, ball.x - size / 2, ball.y - size / 2, size, size)
}

export function pongNetRect(axis: PongAxis, bounds: { width: number; height: number }, thickness = 2): Rect {
  const along = axis === 'horizontal' ? bounds.width : bounds.height
  const cross = axis === 'horizontal' ? bounds.height : bounds.width
  return projectRect(axis, along / 2 - thickness / 2, 0, thickness, cross)
}
