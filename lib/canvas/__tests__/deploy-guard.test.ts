import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertCanvasDeployable } from '@/lib/canvas/service'
import type { CanvasConfig } from '@/lib/types'

const root = process.cwd()
const config: CanvasConfig = {
  arrangement: 'row',
  gap: 10,
  align: 'center',
  slots: [{ id: 'a', frameId: 'fa', offset: { x: 0, y: 0 }, scale: 1, rotation: 90 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
  bezelMode: 'collapse',
  unitMode: 'physical',
  screenWidthMm: 344,
  screenHeightMm: 193,
}

describe('canvas deploy guard', () => {
  it('blocks deployment when an enrolled frame has no screen dimensions', () => {
    expect(() => assertCanvasDeployable(config, [{ id: 'fa', screenWidthMm: null, screenHeightMm: null }]))
      .toThrow(/missing physical screen dimensions: fa/)
  })

  it('permits a fully measured physical wall', () => {
    expect(() => assertCanvasDeployable(config, [{ id: 'fa', screenWidthMm: 344, screenHeightMm: 193 }]))
      .not.toThrow()
  })

  it('wires the controls into the console', () => {
    const panel = readFileSync(path.join(root, 'components/editor/canvas-admin/canvas-extras-panel.tsx'), 'utf8')
    for (const token of ['bezelMode', 'unitMode', 'screenWidthMm', 'screenHeightMm', 'rotation', 'canvas-asset:']) {
      expect(panel).toContain(token)
    }
    const editor = readFileSync(path.join(root, 'components/editor/canvas-admin/arrangement-editor.tsx'), 'utf8')
    expect(editor).toContain('CanvasExtrasPanel')
    const service = readFileSync(path.join(root, 'lib/canvas/service.ts'), 'utf8')
    expect(service).toContain('assertCanvasDeployable')
  })
})
