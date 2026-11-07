import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const canvasSrc = readFileSync(path.join(root, 'components/editor/canvas.tsx'), 'utf8')
const editorSrc = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const toolbarSrc = readFileSync(path.join(root, 'components/editor/widget-toolbar.tsx'), 'utf8')

// Prop-contract test: Canvas must be driven by props (overlay / nightPreview)
// lifted to Editor, not by internal useState. In this repo vitest runs in a
// node environment without jsdom, so we assert the contract at the source
// level rather than mounting React trees. The same failure is observable
// manually: toggling guides via Canvas internal state works, but there is no
// prop-driven overlay/night path to target.

describe('widget bar state lift', () => {
  it('Canvas accepts overlay and nightPreview props (values only)', () => {
    expect(canvasSrc).toMatch(/overlay:\s*Overlay/)
    expect(canvasSrc).toMatch(/nightPreview:\s*boolean/)
    expect(canvasSrc).toMatch(/export (type|const).*Overlay|export type Overlay/)
    // Callbacks live on WidgetToolbar only — Canvas must not require them
    expect(canvasSrc).not.toMatch(/onOverlayChange/)
    expect(canvasSrc).not.toMatch(/onToggleNight/)
  })

  it('Canvas has no internal overlay state and no Segmented control', () => {
    expect(canvasSrc).not.toMatch(/useState<Overlay>/)
    expect(canvasSrc).not.toContain('Segmented')
  })

  it('Editor lifts overlay state and passes the value to Canvas', () => {
    expect(editorSrc).toMatch(/const \[overlay,\s*setOverlay\]\s*=\s*useState<Overlay>/)
    expect(editorSrc).toMatch(/<Canvas[\s\S]*?overlay=\{overlay\}/)
    // Canvas must not receive the callbacks — only WidgetToolbar does
    expect(editorSrc).not.toMatch(/<Canvas[^>]*onOverlayChange/)
    expect(editorSrc).not.toMatch(/<Canvas[^>]*onToggleNight/)
  })

  it('Editor passes overlay/night props to WidgetToolbar', () => {
    expect(editorSrc).toMatch(/<WidgetToolbar[\s\S]*?overlay=\{overlay\}/)
    expect(editorSrc).toMatch(/<WidgetToolbar[\s\S]*?onOverlayChange=\{setOverlay\}/)
    expect(editorSrc).toMatch(/<WidgetToolbar[\s\S]*?nightPreview=\{nightPreview\}/)
    expect(editorSrc).toMatch(/<WidgetToolbar[\s\S]*?onToggleNight=/)
  })

  it('WidgetToolbar accepts overlay/night props', () => {
    expect(toolbarSrc).toMatch(/overlay/)
    expect(toolbarSrc).toMatch(/nightPreview/)
  })

  it('Editor has no dead Menu / PanelLeftClose buttons', () => {
    expect(editorSrc).not.toContain('PanelLeftClose')
    expect(editorSrc).not.toMatch(/<Menu\b/)
    expect(editorSrc).not.toMatch(/aria-label="Open editor menu"/)
  })
})
