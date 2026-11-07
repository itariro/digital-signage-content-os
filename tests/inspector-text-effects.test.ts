import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const controlsSrc = readFileSync(path.join(root, 'components/editor/controls.tsx'), 'utf8')
const inspectorSrc = readFileSync(path.join(root, 'components/editor/inspector.tsx'), 'utf8')

// Vitest here runs in node without jsdom, so we assert the inspector contract
// at the source level (same pattern as tests/frame-scene-text-effects.test.ts):
// the new control primitives exist, TextEffectsSections is gated to single
// text/sticker selection between Content and Style, edits flow through
// updateWidgets/updateStyle with checkpoint-on-slider-commit, and sticker
// edits target layer.style. A mounted renderer would check the DOM, which
// this environment cannot do.

describe('text-effects inspector controls', () => {
  it('exports AngleDial (SVG dial, 0-359), GradientStopPicker and ImageFillField', () => {
    expect(controlsSrc).toMatch(/export function AngleDial/)
    expect(controlsSrc).toMatch(/<svg/)
    expect(controlsSrc).toMatch(/aria-valuemax=\{359\}|max=\{359\}/)
    expect(controlsSrc).toMatch(/export function GradientStopPicker/)
    expect(controlsSrc).toMatch(/Add stop/)
    expect(controlsSrc).toMatch(/Remove/)
    expect(controlsSrc).toMatch(/export function ImageFillField/)
    expect(controlsSrc).toMatch(/['"]curated['"]/)
    expect(controlsSrc).toMatch(/['"]url['"]/)
    expect(controlsSrc).toMatch(/['"]upload['"]/)
  })

  it('ImageFillField reuses the curated manifest and posts to /api/uploads', () => {
    expect(controlsSrc).toMatch(/from\s+['"]@\/lib\/curated-fills['"]/)
    expect(controlsSrc).toMatch(/CURATED_FILLS/)
    expect(controlsSrc).toMatch(/\/api\/uploads/)
    expect(controlsSrc).toMatch(/type="file"/)
  })

  it('GradientStopPicker keeps 2-8 stops with color + position controls', () => {
    expect(controlsSrc).toMatch(/stops\.length <= 2/)
    expect(controlsSrc).toMatch(/stops\.length >= 8/)
    expect(controlsSrc).toMatch(/type="color"/)
  })

  it('TextEffectsSections renders only for a single text or sticker widget', () => {
    expect(inspectorSrc).toMatch(/function TextEffectsSections/)
    expect(inspectorSrc).toMatch(/selection\[0\]\.type === 'text'/)
    expect(inspectorSrc).toMatch(/selection\[0\]\.type === 'sticker'/)
    expect(inspectorSrc).toMatch(/selection\.length === 1/)
  })

  it('TextEffectsSections sits between ContentSection and StyleSections', () => {
    const contentIdx = inspectorSrc.indexOf('<ContentSection')
    const effectsIdx = inspectorSrc.indexOf('<TextEffectsSections')
    const styleIdx = inspectorSrc.indexOf('<StyleSections')
    expect(contentIdx).toBeGreaterThan(-1)
    expect(effectsIdx).toBeGreaterThan(contentIdx)
    expect(styleIdx).toBeGreaterThan(effectsIdx)
  })

  it('edits go through updateStyle/updateWidgets with checkpoint on slider commit', () => {
    expect(inspectorSrc).toMatch(/editor\.updateStyle/)
    expect(inspectorSrc).toMatch(/editor\.updateWidgets/)
    expect(inspectorSrc).toMatch(/editor\.checkpoint\(\)/)
    expect(inspectorSrc).toMatch(/onCommit=\{commit\}/)
    // Slider drags are transient so one undo undoes the whole drag.
    expect(inspectorSrc).toMatch(/onPatch\(\{ lightingShadow:/)
  })

  it('sticker edits update layer.style, not the widget-level style', () => {
    expect(inspectorSrc).toMatch(/function StickerEffectsSections/)
    expect(inspectorSrc).toMatch(/widget\.layers/)
    expect(inspectorSrc).toMatch(/layer\.style/)
    expect(inspectorSrc).toMatch(/layers\.map/)
  })

  it('caption accent sync is gated to caption widgets only (themes keep their accent)', () => {
    expect(inspectorSrc).toMatch(/widget\.type === 'text' && widget\.template === 'caption'/)
    expect(inspectorSrc).toMatch(/selection\.some\(\(w\) => w\.type === 'text' && w\.template === 'caption'\)/)
    expect(inspectorSrc).toMatch(/isCaption \? \{ accent: style\.color \} : \{\}/)
    expect(inspectorSrc).toMatch(/isCaption \? \{ accent: next\.color \} : \{\}/)
  })

  it('offers fill solid/gradient/image, stroke and shadow preset controls', () => {
    expect(inspectorSrc).toMatch(/Text fill/)
    expect(inspectorSrc).toMatch(/Text stroke/)
    expect(inspectorSrc).toMatch(/Text shadow/)
    expect(inspectorSrc).toMatch(/['"]solid['"]/)
    expect(inspectorSrc).toMatch(/['"]gradient['"]/)
    expect(inspectorSrc).toMatch(/['"]image['"]/)
    expect(inspectorSrc).toMatch(/['"]drop['"]/)
    expect(inspectorSrc).toMatch(/['"]long['"]/)
    expect(inspectorSrc).toMatch(/normalizeWidgetStyle/)
  })
})
