import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates'

const root = path.resolve(__dirname, '..')
const picker = readFileSync(path.join(root, 'components/editor/canvas-admin/template-picker.tsx'), 'utf8')
const albums = readFileSync(path.join(root, 'components/editor/canvas-admin/albums-tab.tsx'), 'utf8')

describe('canvas template editor wiring', () => {
  it('offers a New from template button in the Albums tab', () => {
    expect(albums).toContain('New from template')
    expect(albums).toContain('<TemplatePicker')
    expect(albums).toContain('createCanvasTemplate(')
  })

  it('lists all six template names in the picker', () => {
    expect(CANVAS_TEMPLATES.map((template) => template.name)).toEqual([
      'Hello Wall', 'Sync Check', 'Colour Study', 'Type Parade', 'Arcade Night', 'Wall Clock',
    ])
    expect(picker).toContain('CANVAS_TEMPLATES')
  })
})

const options = readFileSync(path.join(root, 'components/editor/canvas-admin/canvas-album-options.tsx'), 'utf8')
const editor = readFileSync(path.join(root, 'components/editor/canvas-admin/album-editor.tsx'), 'utf8')

describe('canvas composition options', () => {
  it('exposes layer, transition and palette controls', () => {
    expect(options).toContain('CANVAS_PALETTES')
    expect(options).toContain('CANVAS_TRANSITION_KINDS')
    expect(options).toContain('Add layer')
    expect(options).toContain('syncCanvasAlbumLayers(')
  })

  it('routes album edits through the layer mirror', () => {
    expect(editor).toContain('syncCanvasAlbumLayers(')
    expect(editor).toContain('<CanvasAlbumOptions')
    expect(editor).not.toContain('onChange({ ...album')
  })
})
