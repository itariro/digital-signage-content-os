import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasState } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { defaultScene } from '@/lib/canvas/scenes/registry'
import { canvasRenderModel } from '@/lib/canvas/render-model'

const config: CanvasConfig = {
  arrangement: 'row', gap: 120, align: 'center',
  slots: [
    { id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'fb', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000', markers: 'identify', notifications: 'suppress', nightMode: 'inherit', maxFps: 30,
}
const geometry = resolveGeometry(config)
const marquee = defaultScene('marquee', geometry)

function deployment(overrides: Partial<CanvasDeployment> = {}): CanvasDeployment {
  return {
    canvasId: 'wall',
    name: 'Wall',
    revision: 4,
    effectiveAt: 10_000,
    releaseAt: null,
    slotId: 'a',
    config,
    album: { id: 'album-1', name: 'Album', scenes: [marquee], order: 'sequence', crossfadeMs: 0 },
    ...overrides,
  }
}

function state(overrides: Partial<CanvasState> = {}): CanvasState {
  return { v: 1, active: deployment(), pending: null, identify: null, ...overrides }
}

describe('canvasRenderModel', () => {
  it('resolves the scene and its state at a synced instant', () => {
    const model = canvasRenderModel(state(), 10_500)!
    expect(model.takeover?.slot.slotId).toBe('a')
    expect(model.plan?.scene.id).toBe(marquee.id)
    expect(model.plan?.sceneTimeMs).toBe(500)
    expect(model.plan?.seed).toBe(marquee.seed)
    expect(model.render?.type).toBe('marquee')
    expect(model.identify).toBeNull()
  })

  it('returns a pre-roll model before the first scene and applies the clock offset', () => {
    const preRoll = canvasRenderModel(state(), 9_000)!
    expect(preRoll.takeover?.slot.slotId).toBe('a')
    expect(preRoll.plan).toBeNull()
    expect(preRoll.render).toBeNull()
    expect(canvasRenderModel(state(), 9_000, 1_500)?.plan?.sceneTimeMs).toBe(500)
  })

  it('shows identify only until its deadline', () => {
    const identify = { until: 12_000, canvasName: 'Wall', frameId: 'fa', label: 'Left', marker: 1, count: 2 }
    expect(canvasRenderModel(state({ identify }), 11_000)?.identify?.marker).toBe(1)
    expect(canvasRenderModel(state({ identify }), 12_000)?.identify).toBeNull()
  })

  it('returns identify without a takeover', () => {
    const identify = { until: 12_000, canvasName: 'Wall', frameId: 'fa', label: 'Left', marker: 1, count: 2 }
    const model = canvasRenderModel(state({ active: null, identify }), 11_000)!
    expect(model.takeover).toBeNull()
    expect(model.plan).toBeNull()
    expect(model.render).toBeNull()
    expect(model.slotRect).toBeNull()
    expect(model.identify?.marker).toBe(1)
  })

  it('returns the takeover without a scene when the album is empty', () => {
    const model = canvasRenderModel(state({ active: deployment({ album: null }) }), 11_000)!
    expect(model.takeover?.deployment.canvasId).toBe('wall')
    expect(model.plan).toBeNull()
    expect(model.render).toBeNull()
  })

  it('is null when the deployment has been released', () => {
    expect(canvasRenderModel(state({ active: deployment({ releaseAt: 11_000 }) }), 11_000)).toBeNull()
    expect(canvasRenderModel(null, 11_000)).toBeNull()
  })

  it('is deterministic', () => {
    expect(canvasRenderModel(state(), 12_345)).toEqual(canvasRenderModel(state(), 12_345))
  })
})
