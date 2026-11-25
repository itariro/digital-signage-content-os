import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const stack = readFileSync(path.join(root, 'components/frame/canvas/canvas-layer-stack.tsx'), 'utf8')
const stage = readFileSync(path.join(root, 'components/frame/canvas/canvas-stage.tsx'), 'utf8')
const preview = readFileSync(path.join(root, 'components/editor/canvas-admin/wall-preview.tsx'), 'utf8')

describe('canvas layer stack wiring', () => {
  it('draws every layer with its own clip, opacity and refs', () => {
    expect(stack).toContain('layers.map(')
    expect(stack).toContain('layer.clipPath')
    expect(stack).toContain('layer.plan?.fade')
    expect(stack).toContain("from './canvas-frame-scene'")
    expect(stack).toContain('refs: CanvasElementRefs')
    expect(stack).toContain('refsForLayer(refsByLayer, layer.layerId)')
  })

  it('is used by the frame stage and the console wall preview', () => {
    expect(stage).toContain('<CanvasLayerStack')
    expect(stage).toContain('refsByLayer={refsByLayer.current}')
    expect(stage).toContain('layerRendersAt(')
    expect(preview).toContain('<CanvasLayerStack')
    expect(preview).toContain('refsByLayer={slotRefs}')
    expect(preview).toContain('layerRendersAt(')
  })

  it('restyles every layer from its own plan after the legacy fade write', () => {
    expect(stage).toContain('style.opacity = String(plan.fade)')
    expect(stage).toContain('wrapper.style.opacity = String(layerOpacity(layer))')
    expect(stage).not.toContain('if (layer === plans[0]) continue')
    expect(stage.indexOf('style.opacity = String(plan.fade)'))
      .toBeLessThan(stage.indexOf('wrapper.style.opacity = String(layerOpacity(layer))'))
  })

  it('tracks layer ids in the change key and keeps mounted refs', () => {
    expect(stage).toContain('layerChangeKey(plans)')
    expect(stage).not.toContain('refsByLayer.current.clear()')
  })
})
