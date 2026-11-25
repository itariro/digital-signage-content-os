import { describe, expect, it } from 'vitest'
import type { LayerRender } from '@/lib/canvas/render-model'
import type { ScenePlan } from '@/lib/canvas/scheduler'
import { layerChangeKey, layerOpacity } from '@/components/frame/canvas/canvas-layer-stack'

function fakePlan(sceneId: string, fade: number): ScenePlan {
  return {
    scene: { id: sceneId } as ScenePlan['scene'],
    index: 0,
    sceneTimeMs: 0,
    cycle: 0,
    nextChangeAtMs: 0,
    fade,
    seed: 1,
  }
}

function fakeLayer(overrides: Partial<LayerRender> = {}): LayerRender {
  return {
    layerId: 'base',
    index: 0,
    name: 'Base',
    opacity: 1,
    plan: null,
    render: null,
    mask: { progress: 1, coverage: 0, front: 0, radius: 0, slotIndex: 0, axis: 'x' },
    clipPath: 'none',
    ...overrides,
  }
}

describe('layer view helpers', () => {
  it('keeps the configured opacity in each layer animated value', () => {
    expect(layerOpacity(fakeLayer({ opacity: 0.4, plan: fakePlan('s1', 0.5) }))).toBe(0.2)
    expect(layerOpacity(fakeLayer({ opacity: 0.4, plan: null }))).toBe(0.4)
  })

  it('keys the layer set by layer id as well as scene id', () => {
    const top = [fakeLayer({ layerId: 'top', plan: fakePlan('s1', 1) })]
    const renamed = [fakeLayer({ layerId: 'overlay', plan: fakePlan('s1', 1) })]
    expect(layerChangeKey(top)).not.toBe(layerChangeKey(renamed))
    expect(layerChangeKey(top)).toBe(layerChangeKey([fakeLayer({ layerId: 'top', plan: fakePlan('s1', 0.25) })]))
  })

  it('detects enabled-layer changes even when the scene ids match', () => {
    const both = [
      fakeLayer({ layerId: 'base', plan: fakePlan('s1', 1) }),
      fakeLayer({ layerId: 'top', index: 1, plan: fakePlan('s2', 1) }),
    ]
    const one = [fakeLayer({ layerId: 'top', index: 1, plan: fakePlan('s2', 1) })]
    expect(layerChangeKey(both)).not.toBe(layerChangeKey(one))
  })
})
