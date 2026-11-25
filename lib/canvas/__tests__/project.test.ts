import { describe, expect, it } from 'vitest'
import { pongBallRect, pongPaddleRect, projectRect } from '@/lib/canvas/project'

describe('projectRect', () => {
  it('keeps along/cross on x/y for horizontal', () => {
    expect(projectRect('horizontal', 10, 20, 30, 40)).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('swaps along/cross for vertical', () => {
    expect(projectRect('vertical', 10, 20, 30, 40)).toEqual({ x: 20, y: 10, w: 40, h: 30 })
  })
})

describe('pong rectangles', () => {
  const paddle = { w: 24, h: 220, inset: 40 }
  const bounds = { width: 1080, height: 1920 }

  it('puts side 0 at the inset and side 1 at the far inset', () => {
    expect(pongPaddleRect('horizontal', 0, paddle, 300, bounds)).toEqual({ x: 40, y: 300, w: 24, h: 220 })
    expect(pongPaddleRect('horizontal', 1, paddle, 300, bounds)).toEqual({ x: 1080 - 64, y: 300, w: 24, h: 220 })
  })

  it('turns paddles across the canvas for a vertical court', () => {
    expect(pongPaddleRect('vertical', 0, paddle, 100, bounds)).toEqual({ x: 100, y: 40, w: 220, h: 24 })
    expect(pongPaddleRect('vertical', 1, paddle, 100, bounds)).toEqual({ x: 100, y: 1920 - 64, w: 220, h: 24 })
  })

  it('centres the ball on its position', () => {
    expect(pongBallRect('horizontal', { x: 500, y: 300 }, 28)).toEqual({ x: 486, y: 286, w: 28, h: 28 })
    expect(pongBallRect('vertical', { x: 500, y: 300 }, 28)).toEqual({ x: 286, y: 486, w: 28, h: 28 })
  })
})
