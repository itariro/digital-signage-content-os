import { describe, it, expect } from 'vitest'
import { WIDGETS, getDefinition, createWidget } from '../widgets'
import { WIDGET_TYPES } from '../types'
import { widgetSchema } from '../schema'

describe('widget registry', () => {
  it('defines exactly one entry per widget type', () => {
    for (const type of WIDGET_TYPES) {
      expect(WIDGETS.filter((d) => d.type === type).length, `missing definition for "${type}"`).toBe(1)
    }
    expect(WIDGETS.length).toBe(WIDGET_TYPES.length)
  })

  it('resolves every widget type without silent fallback', () => {
    for (const type of WIDGET_TYPES) {
      expect(getDefinition(type).type).toBe(type)
    }
  })

  it('creates schema-valid default widgets for every widget type', () => {
    for (const type of WIDGET_TYPES) {
      const result = widgetSchema.safeParse(createWidget(type))
      expect(result.success, `${type} default failed validation`).toBe(true)
    }
  })

  it('marks stickers aspect-locked with no generic content fields', () => {
    const def = getDefinition('sticker')
    expect(def.lockAspect).toBe(true)
    expect(def.fields).toHaveLength(0)
    expect(def.templates.length).toBeGreaterThan(0)
  })
})
