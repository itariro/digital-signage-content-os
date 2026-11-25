import { describe, expect, it } from 'vitest'
import type { CanvasTakeover } from '@/lib/canvas/takeover'
import { canvasLoopKey, fitScale } from '@/lib/canvas/stage'

function takeover(revision = 3, slotId = 'a'): CanvasTakeover {
  return {
    deployment: {
      canvasId: 'wall',
      revision,
      effectiveAt: 1_000,
      releaseAt: null,
      slotId,
      config: { maxFps: 30 },
      album: null,
    },
    geometry: { width: 1080, height: 1920, slots: [], gaps: [] },
    slot: { slotId, index: 0, marker: 1, x: 0, y: 0, w: 1080, h: 1920, scale: 1 },
  } as unknown as CanvasTakeover
}

describe('fitScale', () => {
  it('fits a slot inside the viewport without cropping', () => {
    expect(fitScale(1080, 1920, 1080, 1920)).toBe(1)
    expect(fitScale(1080, 1920, 1920, 1080)).toBe(0.5625)
    expect(fitScale(540, 960, 1080, 1920)).toBe(2)
  })

  it('returns zero before the viewport is known', () => {
    expect(fitScale(1080, 1920, 0, 0)).toBe(0)
    expect(fitScale(0, 1920, 1080, 1920)).toBe(0)
  })
})

describe('canvasLoopKey', () => {
  it('stays stable when the same takeover is rebuilt', () => {
    expect(canvasLoopKey(takeover(), 0)).toBe(canvasLoopKey(takeover(), 0))
  })

  it('changes when the deployment, slot or clock changes', () => {
    const base = canvasLoopKey(takeover(), 0)
    expect(canvasLoopKey(takeover(4), 0)).not.toBe(base)
    expect(canvasLoopKey(takeover(3, 'b'), 0)).not.toBe(base)
    expect(canvasLoopKey(takeover(), 25)).not.toBe(base)
  })
})
