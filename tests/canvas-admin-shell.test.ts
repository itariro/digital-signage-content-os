import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas admin shell', () => {
  it('exposes Layouts, Albums and Status tabs', () => {
    const panel = read('components/editor/canvas-admin/canvas-admin-panel.tsx')
    expect(panel).toContain("id: 'layouts'")
    expect(panel).toContain("id: 'albums'")
    expect(panel).toContain("id: 'status'")
    expect(panel).toContain('<LayoutsTab')
    expect(panel).toContain('<AlbumsTab')
    expect(panel).toContain('<StatusTab')
  })

  it('wires deploy release identify and saving into the layouts tab', () => {
    const source = read('components/editor/canvas-admin/layouts-tab.tsx')
    expect(source).toContain('deploy(')
    expect(source).toContain('release(')
    expect(source).toContain('identify(')
    expect(source).toContain('updateLayout(')
    expect(source).toContain('deleteLayout(')
    expect(source).toContain('<ArrangementEditor')
    expect(source).toContain('inCanvas')
  })

  it('adds a console-only rail item to the editor', () => {
    const source = read('components/editor/editor.tsx')
    expect(source).toContain("DrawerId = PanelId | 'canvas' | 'properties'")
    expect(source).toContain("canManageFrames && !singleFrame")
    expect(source).toContain("aria-label=\"Canvas\"")
    expect(source).toContain("activeDrawer === 'canvas'")
    expect(source).toContain('<CanvasAdminPanel />')
    expect(source).toContain("'canvas' ? 'Canvas'")
  })
})
