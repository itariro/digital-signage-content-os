import { describe, expect, it } from 'vitest'
import type { CanvasDeployment, CanvasState } from '@/lib/types'
import { resolveCanvasTakeover } from '@/lib/canvas/takeover'

const config = {
  arrangement: 'row' as const,
  gap: 0,
  align: 'center' as const,
  slots: [
    { id: 'a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 },
    { id: 'b', frameId: 'frame-b', offset: { x: 0, y: 0 }, scale: 1 },
  ],
  background: '#000000',
  markers: 'identify' as const,
  notifications: 'suppress' as const,
  nightMode: 'inherit' as const,
  maxFps: 30 as const,
}

function deployment(overrides: Partial<CanvasDeployment> = {}): CanvasDeployment {
  return {
    canvasId: 'wall',
    name: 'Wall',
    revision: 1,
    effectiveAt: 1_000,
    releaseAt: null,
    slotId: 'b',
    config,
    album: null,
    ...overrides,
  }
}

function state(overrides: Partial<CanvasState> = {}): CanvasState {
  return { v: 1, active: deployment(), pending: null, identify: null, ...overrides }
}

describe('resolveCanvasTakeover', () => {
  it('returns the active deployment with geometry and the matching slot', () => {
    const result = resolveCanvasTakeover(state(), 2_000)!
    expect(result.deployment.canvasId).toBe('wall')
    expect(result.geometry.width).toBe(2160)
    expect(result.slot.slotId).toBe('b')
    expect(result.slot.marker).toBe(2)
  })

  it('promotes pending at effectiveAt and keeps active before it', () => {
    const pending = deployment({ revision: 2, effectiveAt: 5_000 })
    const both = state({ pending })
    expect(resolveCanvasTakeover(both, 4_999)?.deployment.revision).toBe(1)
    expect(resolveCanvasTakeover(both, 5_000)?.deployment.revision).toBe(2)
  })

  it('does not take over before effectiveAt or after releaseAt', () => {
    expect(resolveCanvasTakeover(state(), 999)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: deployment({ releaseAt: 2_000 }) }), 2_000)).toBeNull()
  })

  it('returns null without state or when the slot is missing', () => {
    expect(resolveCanvasTakeover(null, 2_000)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: null }), 2_000)).toBeNull()
    expect(resolveCanvasTakeover(state({ active: deployment({ slotId: 'gone' }) }), 2_000)).toBeNull()
  })

  it('never consults identify', () => {
    const identify = { until: 9_999, canvasName: 'Wall', frameId: 'frame-b', label: null, marker: 2, count: 2 }
    expect(resolveCanvasTakeover(state({ identify }), 2_000)?.slot.slotId).toBe('b')
  })
})
