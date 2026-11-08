import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const canvasSrc = readFileSync(path.join(root, 'components/editor/canvas.tsx'), 'utf8')
const editorSrc = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const topBarSrc = readFileSync(path.join(root, 'components/editor/top-bar.tsx'), 'utf8')

describe('widget bar state lift', () => {
  it('Canvas accepts overlay and guide change props', () => {
    expect(canvasSrc).toMatch(/overlay:\s*Overlay/)
    expect(canvasSrc).toMatch(/onOverlayChange:\s*\(.*Overlay.*\)\s*=>\s*void/)
    expect(canvasSrc).toMatch(/export (type|const).*Overlay|export type Overlay/)
    expect(canvasSrc).toContain('label="Composition guides"')
    expect(canvasSrc).toContain('onChange={onOverlayChange}')
  })

  it('Canvas has no internal overlay state', () => {
    expect(canvasSrc).not.toMatch(/useState<Overlay>/)
  })

  it('Editor owns guide state and passes it to Canvas', () => {
    expect(editorSrc).toMatch(/const \[overlay,\s*setOverlay\]\s*=\s*useState<Overlay>/)
    expect(editorSrc).toMatch(/<Canvas[\s\S]*?overlay=\{overlay\}/)
    expect(editorSrc).toMatch(/<Canvas[\s\S]*?onOverlayChange=\{setOverlay\}/)
  })

  it('Editor gives TopBar control of the existing Night preview state', () => {
    expect(editorSrc).toMatch(/const \[nightPreview,\s*setNightPreview\]\s*=\s*useState\(false\)/)
    expect(editorSrc).toMatch(/<TopBar[\s\S]*?nightPreview=\{nightPreview\}/)
    expect(editorSrc).toMatch(/<TopBar[\s\S]*?onToggleNight=/)
  })

  it('TopBar Night preview button reflects and toggles its controlled state', () => {
    expect(topBarSrc).toContain('aria-pressed={nightPreview}')
    expect(topBarSrc).toContain('onClick={onToggleNight}')
  })

  it('Editor has no dead Menu / PanelLeftClose buttons', () => {
    expect(editorSrc).not.toContain('PanelLeftClose')
    expect(editorSrc).not.toMatch(/<Menu\b/)
    expect(editorSrc).not.toMatch(/aria-label="Open editor menu"/)
  })
})
