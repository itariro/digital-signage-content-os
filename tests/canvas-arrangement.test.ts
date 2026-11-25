import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas arrangement editor', () => {
  it('edits arrangements, ordering, offsets and display options', () => {
    const source = read('components/editor/canvas-admin/arrangement-editor.tsx')
    for (const arrangement of ['row', 'column', 'grid']) expect(source).toContain(`value: '${arrangement}'`)
    expect(source).toContain('label="Gap"')
    expect(source).toContain('label="Alignment"')
    expect(source).toContain('label="Markers"')
    expect(source).toContain('offset.x')
    expect(source).toContain('scale')
    expect(source).toContain('Empty slot')
    expect(source).toContain('settings.albumId')
    expect(source).toContain('validateGeometry')
    expect(source).toContain('Unpublished changes')
    expect(source).toContain('<WallPreview')
    expect(source).toContain('disabled={Boolean(entry.inCanvas && entry.inCanvas.canvasId !== layout.id)}')
    expect(source).toContain('max={600}')
    expect(source).toContain('label="Canvas colour"')
    expect(source).toContain('Move slot ${index + 1} earlier')
  })

  it('uses the console clock for the preview', () => {
    const source = read('components/editor/canvas-admin/wall-preview.tsx')
    expect(source).toContain("fetch('/api/time'")
    expect(source).toContain('performance.now()')
    expect(source).toContain('sceneAt(')
    expect(source).toContain('CanvasFrameScene')
    expect(source).toContain('paintScene(')
    expect(source).toContain('showBezels')
    expect(source).toContain('marker')
  })
})
