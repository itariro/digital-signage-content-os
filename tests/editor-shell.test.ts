import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const editorSource = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const librarySource = readFileSync(path.join(root, 'components/editor/library-panel.tsx'), 'utf8')

describe('editor navigation shell', () => {
  it('retains all editor sections and adds a Widgets rail item', () => {
    for (const id of ['widgets', 'frames', 'layers', 'layouts', 'albums', 'fonts', 'schedule', 'notifications', 'experiences']) {
      expect(editorSource).toContain(`'${id}'`)
    }
  })

  it('renders the Frames rail entry only for users who can manage frames', () => {
    expect(editorSource).toMatch(
      /\{canManageFrames && \(\s*<button[\s\S]*?aria-label="Frames"[\s\S]*?aria-expanded=\{activeDrawer === 'frames'\}[\s\S]*?aria-controls="editor-drawer"[\s\S]*?toggleDrawer\('frames', event\.currentTarget\)/,
    )
    expect(editorSource).toContain('<Frame className="size-[18px]" aria-hidden />')
    expect(editorSource).toMatch(/activeDrawer === 'frames'\s*\?\s*'Frame administration'/)
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

  it('keeps the canvas, inspector, and existing editor panels mounted', () => {
    expect(editorSource).not.toContain('<WidgetToolbar')
    expect(editorSource).toContain('<Inspector')
    expect(editorSource).toContain('<Canvas')
    expect(editorSource).toContain('w-72')
    expect(editorSource).toContain("{activeDrawer === 'layers' && <LayersPanel")
    expect(editorSource).toContain("{activeDrawer === 'layouts' && (")
    expect(editorSource).toContain("{activeDrawer === 'albums' && <AlbumsPanel")
    expect(editorSource).toContain("{activeDrawer === 'fonts' && <FontsPanel")
    expect(editorSource).toContain("{activeDrawer === 'schedule' && <SchedulePanel")
    expect(editorSource).toContain("{activeDrawer === 'experiences' && <ExperiencesPanel")
    expect(editorSource).toContain("{activeDrawer === 'notifications' && <NotificationsPanel")
  })

  it('mounts administration only for an authorized user with its drawer active', () => {
    expect(editorSource).toContain(
      "{canManageFrames && activeDrawer === 'frames' && <FrameAdminPanel />}",
    )
  })

  it('provides a narrow-screen Properties control', () => {
    expect(editorSource).toContain('Properties')
    expect(editorSource).toMatch(/lg:hidden/)
  })

  it('remembers the trigger when a panel opens from within the inspector', () => {
    expect(editorSource).toContain('if (activeDrawer === null) {')
    expect(editorSource).toContain('const trigger = document.activeElement')
    expect(editorSource).toContain('drawerTriggers.current.set(id, trigger)')
  })

  it('keeps widget-library click and drag completion connected to close behavior', () => {
    expect(librarySource).toContain('onAdd')
    expect(librarySource).toContain('onClose')
    expect(librarySource).toContain('onDragEnd')
    expect(librarySource).toContain('dropEffect')
  })
})
