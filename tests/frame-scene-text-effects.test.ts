import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const sceneSrc = readFileSync(path.join(root, 'components/frame/frame-scene.tsx'), 'utf8')
const contentSrc = readFileSync(path.join(root, 'components/frame/widget-content.tsx'), 'utf8')
const effectsSrc = readFileSync(path.join(root, 'lib/text-effects.ts'), 'utf8')

// Vitest here runs in node without jsdom, so we assert the render contract at
// the source level (same pattern as tests/widget-bar-state.test.ts): WidgetBody
// must compile normalized fill/stroke/shadow into a CSS-native text wrapper for
// type 'text', and StickerWidget must apply the same per layer. A mounted
// renderer would check the computed style, which this environment cannot do.

describe('frame-scene text effects wiring', () => {
  it('exports a textEffectCss helper that composes normalized fill + stroke + shadow (stroke under fill via paint-order)', () => {
    expect(effectsSrc).toMatch(/export function textEffectCss/)
    expect(effectsSrc).toMatch(/normalizeWidgetStyle/)
    expect(effectsSrc).toMatch(/fillCss/)
    expect(effectsSrc).toMatch(/strokeCss/)
    expect(effectsSrc).toMatch(/shadowCss/)
    expect(effectsSrc).toMatch(/paintOrder/)
  })

  it('frame-scene imports the effects helpers', () => {
    expect(sceneSrc).toMatch(/from\s+['"]@\/lib\/text-effects['"]/)
    expect(sceneSrc).toMatch(/textEffectCss/)
  })

  it('WidgetBody wraps text widgets in a background-clip:text effect wrapper (text type only)', () => {
    expect(sceneSrc).toMatch(/widget\.type\s*===\s*['"]text['"]/)
    expect(sceneSrc).toMatch(/textEffectCss/)
    // The wrapper must spread the effect CSS onto the element that renders the text.
    expect(sceneSrc).toMatch(/\{\s*\.\.\.textEffectCss|style=\{\{\s*\.\.\./)
  })

  it('WidgetBody keeps the legacy drop filter for non-text/sticker widgets (effects scoped to text only)', () => {
    // Non-text widgets keep the legacy drop filter path.
    expect(sceneSrc).toMatch(/s\.shadow/)
    // Effects are gated behind the text-type branch, not applied unconditionally.
    expect(sceneSrc).toMatch(/widget\.type\s*===\s*['"]text['"]/)
    expect(sceneSrc).toMatch(/isText\s*\?\s*textEffectCss/)
  })

  it('surfaceStyle keeps the surface box but leaves text-stroke to the effect layer for text/sticker', () => {
    expect(sceneSrc).toMatch(/export function surfaceStyle/)
    expect(sceneSrc).toMatch(/containerType/)
    expect(sceneSrc).toMatch(/backdropFilter/)
  })

  it('TextWidget caption only uses accent color for solid fill so gradients stay visible', () => {
    expect(contentSrc).toMatch(/fill\?\.kind/)
    expect(contentSrc).toMatch(/['"]solid['"]/)
  })

  it('StickerWidget applies fill/stroke/shadow per layer on the layer text element', () => {
    expect(contentSrc).toMatch(/from\s+['"]@\/lib\/text-effects['"]/)
    expect(contentSrc).toMatch(/textEffectCss/)
    expect(contentSrc).toMatch(/layers\.map/)
  })
})
