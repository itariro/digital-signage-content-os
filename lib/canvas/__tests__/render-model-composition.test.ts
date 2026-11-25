import { describe, expect, it } from 'vitest'
import type { CanvasConfig, CanvasDeployment, CanvasLayer, CanvasScene, CanvasState } from '@/lib/types'
import { resolveGeometry } from '@/lib/canvas/geometry'
import { getCanvasPalette } from '@/lib/canvas/palettes'
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
type MarqueeScene = Extract<CanvasScene, { type: 'marquee' }>
const marquee = defaultScene('marquee', geometry) as MarqueeScene
const sync = defaultScene('sync-test', geometry)

const layers: CanvasLayer[] = [
  { id: 'base', name: 'Base', enabled: true, scenes: [marquee], order: 'sequence', crossfadeMs: 1000 },
  { id: 'top', name: 'Top', enabled: true, scenes: [sync], order: 'sequence', crossfadeMs: 1000 },
]

function state(slotId = 'a', overrides: Partial<CanvasDeployment> = {}): CanvasState {
  const active: CanvasDeployment = {
    canvasId: 'wall', name: 'Wall', revision: 1, effectiveAt: 10_000, releaseAt: null,
    slotId, config,
    album: {
      id: 'album-1', name: 'Album', scenes: [marquee], order: 'sequence', crossfadeMs: 1000,
      layers,
      transition: { kind: 'wipe', durationMs: 1000, direction: 'left' },
      palette: { id: 'mono', name: 'Mono', colors: { primary: '#e2e8f0', secondary: '#94a3b8', accent: '#ffffff', background: '#050505', text: '#ffffff' } },
    },
    ...overrides,
  }
  return { v: 1, active, pending: null, identify: null }
}

describe('layered render model', () => {
  it('renders one layer stack item per enabled layer', () => {
    const model = canvasRenderModel(state(), 10_500)!
    expect(model.layers.map((layer) => layer.layerId)).toEqual(['base', 'top'])
    expect(model.layers.map((layer) => layer.render?.type)).toEqual(['marquee', 'sync-test'])
    expect(model.plan?.scene.id).toBe(marquee.id)
    expect(model.render?.type).toBe('marquee')
  })

  it('skips disabled layers', () => {
    const off = layers.map((layer, index) => index === 1 ? { ...layer, enabled: false } : layer)
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: { ...active.album!, layers: off },
    }), 10_500)!
    expect(model.layers.map((layer) => layer.layerId)).toEqual(['base'])
  })

  it('keeps scene state slot-independent while masks differ by slot', () => {
    const left = canvasRenderModel(state('a'), 10_500)!
    const right = canvasRenderModel(state('b'), 10_500)!
    expect(left.layers.map((layer) => layer.render)).toEqual(right.layers.map((layer) => layer.render))
    expect(left.layers[1].mask.coverage).toBe(1)
    expect(right.layers[1].mask.coverage).toBe(0)
    expect(left.layers[1].mask.front).toBe(right.layers[1].mask.front)
  })

  it('falls back to one layer for a phase 1 snapshot', () => {
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: {
        id: active.album!.id, name: active.album!.name, scenes: [marquee],
        order: 'sequence', crossfadeMs: 1000,
      },
    }), 10_500)!
    expect(model.layers).toHaveLength(1)
    expect(model.layers[0].layerId).toBe('base')
    expect(model.layers[0].render?.type).toBe('marquee')
  })

  it('resolves palette tokens before computing scene state', () => {
    const colored: MarqueeScene = {
      ...marquee,
      type: 'marquee',
      config: { ...marquee.config, style: { ...marquee.config.style, color: 'palette:text' } },
    }
    const active = state().active!
    const model = canvasRenderModel(state('a', {
      album: { ...active.album!, scenes: [colored], layers: [{ ...layers[0], scenes: [colored] }] },
    }), 10_500)!
    expect(model.layers[0].render?.config).toMatchObject({
      style: { color: getCanvasPalette('mono').colors.text },
    })
    expect(colored.config.style.color).toBe('palette:text')
  })
})
