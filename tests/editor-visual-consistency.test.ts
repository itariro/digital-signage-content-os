import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const styles = readFileSync(path.join(root, 'app/globals.css'), 'utf8')
const controls = readFileSync(path.join(root, 'components/editor/controls.tsx'), 'utf8')
const panelSources = Object.fromEntries(
  ['inspector', 'layout-settings', 'layers-panel', 'layouts-panel', 'library-panel'].map((name) => [
    name,
    readFileSync(path.join(root, `components/editor/${name}.tsx`), 'utf8'),
  ]),
)
const shellSources = Object.fromEntries(
  ['editor', 'top-bar', 'canvas', 'frame-switcher', 'preview-overlay'].map((name) => [
    name,
    readFileSync(path.join(root, `components/editor/${name}.tsx`), 'utf8'),
  ]),
)
const contentSources = Object.fromEntries(
  ['albums-panel', 'album-detail', 'fonts-panel', 'schedule-panel', 'notifications-panel', 'experiences-panel'].map((name) => [
    name,
    readFileSync(path.join(root, `components/editor/${name}.tsx`), 'utf8'),
  ]),
)

describe('editor visual system', () => {
  it('defines editor-scoped action variants and field focus treatment', () => {
    for (const selector of [
      '.editor-button',
      '.editor-button-primary',
      '.editor-button-secondary',
      '.editor-button-quiet',
      '.editor-button-destructive',
      '.editor-control:focus-visible',
      '.editor-icon-button',
    ]) {
      expect(styles).toContain(selector)
    }
  })

  it('exposes a typed EditorButton that composes the shared action styles', () => {
    expect(controls).toContain("export type EditorButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'")
    expect(controls).toContain('export function EditorButton')
    expect(controls).toContain('editor-button-${variant}')
  })

  it('uses shared sections and editor controls throughout the inspector and layout settings', () => {
    const { inspector, 'layout-settings': layoutSettings, 'library-panel': library } = panelSources

    for (const source of [inspector, layoutSettings]) {
      expect(source).toContain('<Section title=')
      expect(source).toContain('className="editor-control')
    }

    expect(controls).toContain('editor-panel-section')
    expect(controls).toContain('className="editor-control')
    expect(library).toContain('className="editor-control')
  })

  it('uses shared action treatments for layer, layout, and library actions', () => {
    const { 'layers-panel': layers, 'layouts-panel': layouts, 'library-panel': library } = panelSources

    expect(layers).toContain('import { IconButton } from')
    expect(layers).toContain('<IconButton label="Move up"')
    expect(layouts).toMatch(/<EditorButton\b(?=[^>]*variant="primary")(?=[^>]*onClick=\{onCreate\})/)
    expect(layouts).toMatch(/<EditorButton\b(?=[^>]*variant="secondary")(?=[^>]*onClick=\{\(\) => fileRef\.current\?\.click\(\)\})/)
    expect(layouts).toContain('<IconButton label={`Duplicate ${layout.name}`}')
    expect(library).toContain('<EditorButton')
  })

  it('uses shared action components for shell text and icon actions', () => {
    const { editor, 'top-bar': topBar, 'frame-switcher': frameSwitcher, 'preview-overlay': preview } = shellSources

    expect(editor).toContain('import { IconButton } from')
    expect(editor).toContain('<IconButton label={`Close ${drawerTitle} panel`} onClick={closeDrawer}>')
    expect(editor).toContain("'editor-icon-button size-8 rounded-lg'")

    expect(topBar).toMatch(/<EditorButton\s+type="button"\s+variant="secondary"\s+onClick=\{onPreview\}\s+className=/)
    expect(topBar).toMatch(/<EditorButton\s+type="button"\s+aria-label="Night preview"\s+aria-pressed=\{nightPreview\}\s+variant="quiet"\s+onClick=\{onToggleNight\}\s+className=/)
    expect(topBar).toMatch(/<EditorButton\s+type="button"\s+variant="primary"\s+onClick=\{onSave\}[\s\S]*?className=/)
    expect(topBar).toContain('<IconButton label="Export layout JSON" onClick={onExport}')
    expect(topBar).toContain('<IconButton label="Undo (⌘Z)"')
    expect(topBar).toContain('<IconButton label="Redo (⇧⌘Z)"')

    expect(frameSwitcher).toMatch(/<EditorButton type="button" variant="primary"[^>]*onClick=\{saveFrame\}>[\s\S]*?Save frame/)
    expect(frameSwitcher).toMatch(/<EditorButton type="button" variant="quiet"[^>]*onClick=\{\(\) => setEditing\(null\)\}>Cancel/)
    expect(frameSwitcher.match(/<EditorButton\b/g)).toHaveLength(3)
    expect(frameSwitcher).toContain('<IconButton label={`Edit ${frame.name}`}')
    expect(frameSwitcher).toContain('<IconButton label={`Remove ${frame.name}`} onClick={() => removeFrame(frame.id)} className="hover:text-destructive">')
    expect(frameSwitcher).toContain('className="editor-icon-button"')

    expect(preview).toMatch(/<EditorButton\s+type="button"\s+variant="secondary"\s+autoFocus\s+onClick=\{onClose\}\s+className=/)
  })

  it('keeps shell action callbacks and canvas interactions wired', () => {
    const { editor, 'top-bar': topBar, canvas } = shellSources

    for (const handler of ['onPreview', 'onSave', 'onExport', 'onToggleNight']) {
      expect(topBar).toContain(`onClick={${handler}}`)
    }
    expect(editor).toContain("toggleDrawer('widgets', event.currentTarget)")
    expect(editor).toContain("toggleDrawer('frames', event.currentTarget)")
    expect(editor).toContain("toggleDrawer(panel.id, event.currentTarget)")
    expect(editor).toContain("toggleDrawer('properties', event.currentTarget)")

    expect(canvas).toContain('onDrop(JSON.parse(raw) as DropPayload, pointFromEvent(e.clientX, e.clientY))')
    expect(canvas).toContain('onPointerDown={() => editor.select([])}')
    expect(canvas).toContain('editor.select(next)')
    expect(canvas).toContain('onPointerDown={(e) => onWidgetPointerDown(e, widget)}')
    expect(editor).toContain('onDrop={addItem}')
    expect(canvas).toContain('onChange={onOverlayChange}')
  })

  it('uses shared actions, fields, and section spacing in content panels', () => {
    const { 'albums-panel': albums, 'album-detail': albumDetail, 'fonts-panel': fonts, 'schedule-panel': schedule, 'notifications-panel': notifications, 'experiences-panel': experiences } = contentSources

    for (const source of Object.values(contentSources)) {
      expect(source).toContain('<EditorButton')
    }

    for (const source of [albumDetail, fonts, schedule, experiences]) {
      expect(source).toContain('className="editor-control')
    }

    for (const source of [albums, albumDetail, fonts, schedule, experiences, notifications]) {
      expect(source).toContain('<Section')
    }

    expect(albums).toContain("variant={choosing ? 'quiet' : 'primary'}")
    expect(albums).toContain('variant="secondary"')
    expect(albumDetail).toContain('variant="destructive"')
    expect(fonts).toContain('variant="primary"')
    expect(schedule).toContain('editor-button editor-button-secondary')
    expect(notifications).toContain('variant="destructive"')
    expect(experiences).toContain('variant="primary"')
  })

  it('preserves existing submit, cancel, delete, reset, and save callbacks', () => {
    const { 'albums-panel': albums, 'album-detail': albumDetail, 'fonts-panel': fonts, 'schedule-panel': schedule, 'notifications-panel': notifications, 'experiences-panel': experiences } = contentSources

    expect(albums).toContain('onCreate(theme)')
    expect(albums).toContain('setChoosing(false)')
    expect(albums).toContain('onDelete(open)')
    expect(albumDetail).toContain('onClick={onBack}')
    expect(albumDetail).toContain('onClick={onDelete}')
    expect(albumDetail).toContain('onUpdate(album.id')

    expect(fonts).toContain('onSubmit={submit}')
    expect(fonts).toContain('await onAdd(family.trim())')
    expect(fonts).toContain('onRemove(f)')
    expect(schedule).toContain('onSave(next)')
    expect(experiences).toContain('onSave(next)')

    expect(notifications).toContain('onClick={() => setHistory([])}')
    expect(notifications).toContain('setHistory(createDemoNotifications())')
    expect(notifications).toContain('onClick={sendToLiveFrame}')
  })
})
