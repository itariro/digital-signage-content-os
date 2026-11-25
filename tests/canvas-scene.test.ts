import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const scene = readFileSync(path.join(root, 'components/frame/canvas/canvas-frame-scene.tsx'), 'utf8')

describe('canvas scene rendering', () => {
  it('has a renderer for every scene type', () => {
    for (const name of ['MarqueeView', 'BounceView', 'PongView', 'SyncTestView', 'CanvasFrameScene']) {
      expect(scene).toContain(`function ${name}`)
    }
  })

  it('clips marquee copies to the slot with the shared helpers', () => {
    expect(scene).toContain('visibleCopies(config, geometry, slot, state.tauPx)')
    expect(scene).toContain('copyPosition(config, geometry, state.tauPx, copy)')
    expect(scene).toContain('visibleSegments(')
    expect(scene).toContain('marqueePoolSize(')
    expect(scene).not.toContain('MARQUEE_POOL')
  })

  it('projects pong court coordinates for either axis', () => {
    expect(scene).toContain('pongPaddleRect(')
    expect(scene).toContain('pongBallRect(')
    expect(scene).toContain('pongNetRect(')
  })

  it('paints the bounce trail and corner only when enabled and motion is allowed', () => {
    expect(scene).toContain('state.trail.length > 0')
    expect(scene).toContain('config.cornerCelebration')
    expect(scene).toContain("prefers-reduced-motion: reduce")
    expect(scene).toContain('export function paintScene')
  })

  it('applies the animated tint to the element that paints a text logo', () => {
    expect(scene).toContain("ref('bounce:text', refs)")
    expect(scene).toContain('text.style.color = tint')
  })

  it('draws the sync-test helpers', () => {
    expect(scene).toContain('config.showGrid')
    expect(scene).toContain('config.showBezels')
  })
})
