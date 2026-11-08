import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const editorSource = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const librarySource = readFileSync(path.join(root, 'components/editor/library-panel.tsx'), 'utf8')

describe('editor navigation shell', () => {
  it('retains all editor sections and adds a Widgets rail item', () => {
    for (const id of ['widgets', 'layers', 'layouts', 'albums', 'fonts', 'schedule', 'notifications', 'experiences']) {
      expect(editorSource).toContain(`'${id}'`)
    }
  })

  it('mounts the existing library and connects it to the existing add path', () => {
    expect(editorSource).toContain('<LibraryPanel')
    expect(editorSource).toContain('addItem(payload)')
    expect(editorSource).toContain('closeDrawer()')
    expect(editorSource).toContain('onDeletePreset={deletePreset}')
  })

  it('exposes an overlay state and Escape dismissal', () => {
    expect(editorSource).toContain('aria-expanded')
    expect(editorSource).toContain('Escape')
    expect(editorSource).toContain('role="dialog"')
  })

  it('keeps the existing canvas toolbar and inspector mounted', () => {
    expect(editorSource).toContain('<WidgetToolbar')
    expect(editorSource).toContain('<Inspector')
    expect(editorSource).toContain('<Canvas')
  })

  it('provides a narrow-screen Properties control', () => {
    expect(editorSource).toContain('Properties')
    expect(editorSource).toMatch(/lg:hidden/)
  })

  it('keeps widget-library click and drag completion connected to close behavior', () => {
    expect(librarySource).toContain('onAdd')
    expect(librarySource).toContain('onClose')
    expect(librarySource).toContain('onDragEnd')
    expect(librarySource).toContain('dropEffect')
  })
})
