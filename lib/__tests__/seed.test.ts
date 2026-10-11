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

  it('wires each default rule to the correct named layout', () => {
    const store = seed()
    const nameToId = new Map(store.layouts.map(l => [l.name, l.id]))
    const expected: Record<string, string> = {
      Morning: 'Morning',
      Gallery: 'Gallery',
      'Welcome home': 'Welcome Home',
      Evening: 'Evening',
      Weekend: 'Weekend',
      Rain: 'Weather',
      Night: 'Night',
    }
    for (const rule of store.experiences.rules) {
      const expectedName = expected[rule.name]
      expect(expectedName, `unexpected default rule "${rule.name}"`).toBeDefined()
      const expectedId = nameToId.get(expectedName)
      expect(expectedId, `no curated layout named "${expectedName}"`).toBeDefined()
      expect(rule.then.layoutId).toBe(expectedId)
    }
  })

  it('keeps a fresh normalize default disabled for pre-existing frames', () => {
    const legacy = { activeId: 'l1', layouts: [{ id: 'l1', name: 'L' }], schedule: { enabled: false, rules: [] }, albums: [] } as any
    expect(normalize(legacy).experiences.enabled).toBe(false)
  })

  it('authors speech on several default rules so the bridge can speak out of the box', () => {
    const withSpeech = seed().experiences.rules.filter((r) => r.then.bob?.speech?.trim())
    expect(withSpeech.length).toBeGreaterThanOrEqual(3)
  })
})
