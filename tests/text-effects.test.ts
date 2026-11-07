import { describe, it, expect } from 'vitest'
import { normalizeWidgetStyle, fillCss, shadowCss } from '@/lib/text-effects'

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

describe('fillCss gradient', () => {
  it('builds linear-gradient string', () => {
    const css = fillCss({ kind: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ color: '#ff8fa3', position: 0 }, { color: '#7cc4ff', position: 100 }] } })
    expect(css.backgroundImage).toContain('linear-gradient(135deg')
    expect((css as any).webkitBackgroundClip).toBe('text')
  })
})
