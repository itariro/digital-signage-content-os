import { describe, it, expect } from 'vitest'
import { seed, normalize } from '../store'

const CURATED = ['Morning', 'Today', 'Gallery', 'Welcome Home', 'Evening', 'Weekend', 'Weather', 'Night']

describe('seed', () => {
  it('seeds the curated layouts', () => {
    const store = seed()
    const names = store.layouts.map(l => l.name)
    for (const name of CURATED) expect(names).toContain(name)
  })

  it('enables the engine with default rules that all resolve to real layouts', () => {
    const store = seed()
    expect(store.experiences.enabled).toBe(true)
    expect(store.experiences.rules.length).toBeGreaterThanOrEqual(7)
    const layoutIds = new Set(store.layouts.map(l => l.id))
    for (const rule of store.experiences.rules) {
      expect(layoutIds.has(rule.then.layoutId)).toBe(true)
    }
  })

  it('keeps a fresh normalize default disabled for pre-existing frames', () => {
    const legacy = { activeId: 'l1', layouts: [{ id: 'l1', name: 'L' }], schedule: { enabled: false, rules: [] }, albums: [] } as any
    expect(normalize(legacy).experiences.enabled).toBe(false)
  })
})
