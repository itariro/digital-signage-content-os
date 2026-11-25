import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CanvasBezelOverlay } from '@/components/frame/canvas/canvas-bezel-overlay'
import { rotatedSlotStyle } from '@/lib/canvas/geometry'

const gap = { x: 1080, y: 0, w: 120, h: 1920 }
const root = process.cwd()
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('CanvasBezelOverlay', () => {
  it('paints gap rectangles in show mode', () => {
    const markup = renderToStaticMarkup(createElement(CanvasBezelOverlay, { mode: 'show', gaps: [gap] }))
    expect(markup).toContain('data-canvas-bezel')
    expect(markup).toContain('120px')
  })

  it('paints nothing for hide and collapse modes', () => {
    for (const mode of ['hide', 'collapse'] as const) {
      expect(renderToStaticMarkup(createElement(CanvasBezelOverlay, { mode, gaps: [gap] }))).toBe('')
    }
  })

  it('rotates a slot wrapper once around its centre', () => {
    const slot = { slotId: 'a', index: 0, marker: 1, x: 0, y: 0, w: 1920, h: 1080, scale: 1, rotation: 90 as const }
    const markup = renderToStaticMarkup(
      createElement('div', { 'data-slot-rotation': true, style: rotatedSlotStyle(slot) }),
    )
    expect(markup).toContain('rotate(90deg)')
    expect(markup).toContain('translate(960px, 540px)')
  })

  it('renders the overlay and rotation in both preview and stage', () => {
    for (const file of [
      'components/editor/canvas-admin/wall-preview.tsx',
      'components/frame/canvas/canvas-stage.tsx',
    ]) {
      expect(read(file), file).toContain('rotatedSlotStyle')
    }
    const preview = read('components/editor/canvas-admin/wall-preview.tsx')
    expect(preview).toContain('CanvasBezelOverlay')
    expect(preview).toContain('geometry.gaps')
    expect(preview).toContain('bezelMode')
    expect(read('lib/canvas/draw.ts')).not.toContain('options.rotation')
  })
})
