import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const display = readFileSync(path.join(root, 'components/frame/frame-display.tsx'), 'utf8')
const stage = readFileSync(path.join(root, 'components/frame/canvas/canvas-stage.tsx'), 'utf8')
const overlay = readFileSync(path.join(root, 'components/frame/canvas/identify-overlay.tsx'), 'utf8')

describe('frame display canvas takeover', () => {
  it('polls canvas state and swaps in the stage', () => {
    expect(display).toContain('/api/canvas/state?frame=')
    expect(display).toContain('canvasRenderModel(')
    expect(display).toContain('<CanvasStage')
    expect(display).not.toContain('setFrameTick')
  })

  it('reports the applied revision, viewport and measured fps', () => {
    expect(display).toContain('/api/canvas/report?frame=')
    expect(display).toContain('appliedRevision: canvasModel ? revision : null')
    expect(display).toContain('fpsAvg: fpsRef.current')
  })

  it('owns the animation loop in the stage and paints through refs', () => {
    expect(stage).toContain('requestAnimationFrame(')
    expect(stage).toContain('paintScene(')
    expect(stage).toContain('sceneAt(')
    expect(stage).toContain('onFps?.(')
    expect(stage).not.toContain('setFrameTick')
  })

  it('keeps the stage filled with the canvas background and handles pre-roll', () => {
    expect(stage).toContain('deployment.config.background')
    expect(stage).toContain('fitScale(')
    expect(stage).toContain("!scene && config.markers !== 'never'")
  })

  it('renders identify without a takeover', () => {
    expect(stage).toContain('if (!takeover)')
    expect(stage).toContain('<IdentifyOverlay')
    expect(overlay).toContain('identify.label')
    expect(overlay).toContain('Frame ${identify.marker} of ${identify.count}')
    expect(overlay).toContain('model.slotRect')
    expect(overlay).toContain('clock.quality')
    expect(stage).toContain('NightOverlay')
    expect(stage).toContain('FrameNoticeLayer')
  })
})
