import { describe, it, expect } from 'vitest'
import { normalize } from '../../store'

describe('normalize', () => {
  it('adds default experiences when missing', () => {
    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test' }],
      schedule: { enabled: false, rules: [] },
      albums: [],
    } as any
    const result = normalize(store)
    expect(result.experiences).toEqual({ enabled: false, rules: [], settings: { schoolHolidays: [] } })
  })

  it('prunes experience rules referencing deleted layouts', () => {
    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test' }],
      schedule: { enabled: false, rules: [] },
      albums: [],
      experiences: {
        enabled: true,
        rules: [
          { id: 'r1', name: 'Good', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
          { id: 'r2', name: 'Bad', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'deleted', state: 'ambient', score: 0, durationMs: 0 } },
        ],
        settings: { schoolHolidays: [] },
      },
    } as any
    const result = normalize(store)
    expect(result.experiences.rules).toHaveLength(1)
    expect(result.experiences.rules[0].id).toBe('r1')
  })
})
