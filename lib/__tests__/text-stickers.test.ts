import { describe, it, expect } from 'vitest'
import { BUILTIN_STICKERS, createStickerWidget } from '../text-stickers'
import { createWidget } from '../widgets'
import { widgetSchema } from '../schema'

describe('text stickers', () => {
  it('ships a non-empty library', () => {
    expect(BUILTIN_STICKERS.length).toBeGreaterThan(0)
  })

  it('has unique sticker ids', () => {
    const ids = BUILTIN_STICKERS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses finite positions and dimensions', () => {
    for (const sticker of BUILTIN_STICKERS) {
      expect(Number.isFinite(sticker.w) && sticker.w > 0).toBe(true)
      expect(Number.isFinite(sticker.h) && sticker.h > 0).toBe(true)
      for (const layer of sticker.layers) {
        expect(Number.isFinite(layer.x)).toBe(true)
        expect(Number.isFinite(layer.y)).toBe(true)
        expect(Number.isFinite(layer.w) && layer.w > 0).toBe(true)
        expect(Number.isFinite(layer.h) && layer.h > 0).toBe(true)
        expect(layer.text.length).toBeLessThanOrEqual(300)
      }
    }
  })

  it('creates widgets accepted by widgetSchema', () => {
    for (const template of BUILTIN_STICKERS) {
      const widget = createStickerWidget(template)
      const result = widgetSchema.safeParse(widget)
      expect(result.success).toBe(true)
    }
  })

  it('creates independent layer ids', () => {
    const a = createStickerWidget(BUILTIN_STICKERS[0])
    const b = createStickerWidget(BUILTIN_STICKERS[0])
    const aIds = (a.layers ?? []).map((l) => l.id)
    const bIds = (b.layers ?? []).map((l) => l.id)
    expect(a.id).not.toBe(b.id)
    expect(aIds).not.toEqual(bIds)
  })

  it('does not mutate the template on instantiation', () => {
    const template = BUILTIN_STICKERS[0]
    const before = JSON.stringify(template)
    createStickerWidget(template)
    expect(JSON.stringify(template)).toBe(before)
  })
})

describe('sticker layer validation', () => {
  it('ships at least 17 built-in templates for testing variety', () => {
    expect(BUILTIN_STICKERS.length).toBeGreaterThanOrEqual(17)
  })

  it('keeps every layer inside the 1000×500 sticker space', () => {
    for (const sticker of BUILTIN_STICKERS) {
      for (const layer of sticker.layers) {
        const fits = layer.x >= 0 && layer.y >= 0 && layer.x + layer.w <= 1000 && layer.y + layer.h <= 500
        expect(fits, `${sticker.id} layer "${layer.text}" escapes the sticker space`).toBe(true)
      }
    }
  })

  it('rejects sticker widgets with zero layers', () => {
    const widget = { ...createStickerWidget(BUILTIN_STICKERS[0]), layers: [] }
    expect(widgetSchema.safeParse(widget).success).toBe(false)
    const { layers: _layers, ...widgetWithoutLayers } = widget
    expect(widgetSchema.safeParse(widgetWithoutLayers).success).toBe(false)
  })

  it('rejects layers on non-sticker widgets', () => {
    const clock = createWidget('clock-digital')
    const layered = { ...clock, layers: createStickerWidget(BUILTIN_STICKERS[0]).layers }
    expect(widgetSchema.safeParse(layered).success).toBe(false)
  })
})