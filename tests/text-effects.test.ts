import { describe, it, expect } from 'vitest'
import { normalizeWidgetStyle, fillCss, shadowCss, strokeCss } from '@/lib/text-effects'
import { createWidget } from '@/lib/widgets'
import { BUILTIN_STICKERS, createStickerWidget } from '@/lib/text-stickers'
import { widgetSchema } from '@/lib/schema'

const alphas = (value: string) => [...value.matchAll(/rgba?\([^)]*?,\s*([\d.]+)\)/g)].map((m) => Number(m[1]))

describe('normalizeWidgetStyle', () => {
  it('migrates legacy shadow=true to drop preset', () => {
    const out = normalizeWidgetStyle({ shadow: true } as any)
    expect(out.lightingShadow?.preset).toBe('drop')
  })
  it('migrates legacy shadow=false to none', () => {
    const out = normalizeWidgetStyle({ shadow: false } as any)
    expect(out.lightingShadow?.preset).toBe('none')
  })
  it('migrates textStroke number to cfg', () => {
    const out = normalizeWidgetStyle({ textStroke: 6, stroke: '#ffffff' } as any)
    expect(out.textStrokeCfg).toMatchObject({ enabled: true, thickness: 6 })
  })
})

describe('save/load round-trip through widgetSchema', () => {
  it('preserves effect fields on a text widget', () => {
    const widget = createWidget('text')
    widget.style = normalizeWidgetStyle({
      ...widget.style,
      fill: { kind: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ color: '#ff8fa3', position: 0 }, { color: '#7cc4ff', position: 100 }] } },
      textStrokeCfg: { enabled: true, color: '#000000', thickness: 3, opacity: 80, align: 'outside' },
      lightingShadow: { preset: 'long', distance: 12, blur: 0, opacity: 40, angle: 90, color: '#000000', steps: 40 },
    })
    const result = widgetSchema.safeParse(JSON.parse(JSON.stringify(widget)))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.style.fill).toEqual(widget.style.fill)
    expect(result.data.style.textStrokeCfg).toEqual(widget.style.textStrokeCfg)
    expect(result.data.style.lightingShadow).toEqual(widget.style.lightingShadow)
  })

  it('preserves image fill with an http URL (picker accepts http, schema must too)', () => {
    const widget = createWidget('text')
    widget.style = normalizeWidgetStyle({
      ...widget.style,
      fill: { kind: 'image', image: { url: 'http://example.com/fill.jpg', fit: 'cover', scale: 100, position: 50 } },
    })
    const result = widgetSchema.safeParse(JSON.parse(JSON.stringify(widget)))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.style.fill).toEqual(widget.style.fill)
  })

  it('preserves effect fields on sticker layers', () => {
    const widget = createStickerWidget(BUILTIN_STICKERS[0])
    widget.layers![0].style = normalizeWidgetStyle({
      ...widget.layers![0].style,
      fill: { kind: 'image', image: { url: '/api/uploads/abc.png', fit: 'cover', scale: 100, position: 50 } },
      textStrokeCfg: { enabled: true, color: '#0b0c10', thickness: 2, opacity: 100, align: 'inside' },
      lightingShadow: { preset: 'contact', distance: 4, blur: 8, opacity: 50, angle: 90, color: '#000000' },
    })
    const result = widgetSchema.safeParse(JSON.parse(JSON.stringify(widget)))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.layers![0].style.fill).toEqual(widget.layers![0].style.fill)
    expect(result.data.layers![0].style.textStrokeCfg).toEqual(widget.layers![0].style.textStrokeCfg)
    expect(result.data.layers![0].style.lightingShadow).toEqual(widget.layers![0].style.lightingShadow)
  })
})

describe('fillCss solid', () => {
  it('returns the solid colour with no background image', () => {
    const css = fillCss({ kind: 'solid', color: '#ff0000' })
    expect(css).toMatchObject({ backgroundImage: 'none', color: '#ff0000' })
  })
})

describe('fillCss gradient', () => {
  it('builds linear-gradient string', () => {
    const css = fillCss({ kind: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ color: '#ff8fa3', position: 0 }, { color: '#7cc4ff', position: 100 }] } })
    expect(css.backgroundImage).toContain('linear-gradient(135deg')
    expect((css as any).webkitBackgroundClip).toBe('text')
  })
})

describe('fillCss image', () => {
  const image = (over: Partial<{ url: string; fit: 'cover' | 'contain' | 'repeat'; scale: number; position: number }> = {}) => ({
    kind: 'image' as const,
    image: { url: '/fills/marble.jpg', fit: 'cover' as const, scale: 100, position: 50, ...over },
  })
  it('keeps cover at scale 100', () => {
    expect(fillCss(image()).backgroundSize).toBe('cover')
  })
  it('keeps contain at scale 100', () => {
    expect(fillCss(image({ fit: 'contain' })).backgroundSize).toBe('contain')
  })
  it('sizes repeat tiles by scale', () => {
    expect(fillCss(image({ fit: 'repeat', scale: 150 })).backgroundSize).toBe('150% auto')
    expect(fillCss(image({ fit: 'repeat', scale: 50 })).backgroundSize).toBe('50% auto')
  })
  it('zooms cover/contain away from scale 100', () => {
    expect(fillCss(image({ fit: 'cover', scale: 200 })).backgroundSize).toBe('200% auto')
    expect(fillCss(image({ fit: 'contain', scale: 75 })).backgroundSize).toBe('75% auto')
  })
  it('clips to text and positions the image', () => {
    const css = fillCss(image({ position: 25 }))
    expect((css as any).webkitBackgroundClip).toBe('text')
    expect(css.backgroundPosition).toBe('25% center')
    expect(css.backgroundImage).toContain('/fills/marble.jpg')
  })
})

describe('strokeCss', () => {
  it('returns nothing when disabled or zero thickness', () => {
    expect(strokeCss({ enabled: false, color: '#ffffff', thickness: 3, opacity: 100, align: 'outside' })).toEqual({})
    expect(strokeCss({ enabled: true, color: '#ffffff', thickness: 0, opacity: 100, align: 'outside' })).toEqual({})
  })
  it('paints the stroke outside the fill by default', () => {
    const css = strokeCss({ enabled: true, color: '#000000', thickness: 3, opacity: 50, align: 'outside' })
    expect((css as any).WebkitTextStroke).toBe('3px rgba(0, 0, 0, 0.5)')
    expect((css as any).paintOrder).toBe('fill stroke')
  })
  it('paints the stroke inside the fill when aligned inside', () => {
    const css = strokeCss({ enabled: true, color: '#ffffff', thickness: 2, opacity: 100, align: 'inside' })
    expect((css as any).paintOrder).toBe('stroke fill')
  })
})

describe('shadowCss', () => {
  const base = { distance: 10, blur: 5, opacity: 35, angle: 90, color: '#000000' }
  it('returns nothing for the none preset', () => {
    expect(shadowCss({ ...base, preset: 'none' })).toEqual({})
  })
  it('builds a drop shadow', () => {
    const css = shadowCss({ ...base, preset: 'drop' })
    expect(css.textShadow).toBe('0px 10px 5px rgba(0, 0, 0, 0.35)')
  })
  it('builds a contact shadow using blur as the blur radius', () => {
    const css = shadowCss({ ...base, preset: 'contact', distance: 4, blur: 8 })
    expect(css.textShadow).toBe('0 4px 8px rgba(0, 0, 0, 0.35)')
  })
  it('widens the contact shadow by spread (added to blur)', () => {
    const css = shadowCss({ ...base, preset: 'contact', distance: 4, blur: 8, spread: 6 })
    expect(css.textShadow).toBe('0 4px 14px rgba(0, 0, 0, 0.35)')
  })
  it('builds a curved shadow from two drop shadows', () => {
    const css = shadowCss({ ...base, preset: 'curved', spread: 10 })
    expect(css.filter).toContain('drop-shadow(')
    expect((css.filter ?? '').match(/drop-shadow/g)).toHaveLength(2)
  })
  it('fades the long stack so it composites near the chosen opacity', () => {
    const steps = 40
    const css = shadowCss({ ...base, preset: 'long', steps })
    const parts = String(css.textShadow).split(/(?<=\)), /)
    expect(parts).toHaveLength(steps)
    const stepAlphas = alphas(String(css.textShadow))
    // Each step carries opacity/steps, not the full user opacity.
    expect(stepAlphas[0]).toBeCloseTo(0.35 / steps, 4)
    // Composite coverage of the stack stays below full opacity and near 35%.
    const composite = 1 - stepAlphas.reduce((acc, a) => acc * (1 - a), 1)
    expect(composite).toBeLessThan(1)
    expect(composite).toBeGreaterThan(0.2)
    expect(composite).toBeLessThan(0.5)
  })
})
