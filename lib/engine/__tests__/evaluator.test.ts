import { describe, it, expect } from 'vitest'
import { evaluateRules } from '../evaluator'
import type { ExperienceRule, ExperienceContext } from '../types'

function makeContext(overrides?: Partial<ExperienceContext>): ExperienceContext {
  return {
    now: '2026-10-08T10:00:00Z',
    date: { iso: '2026-10-08', day: 'Thursday', dayNumber: 8, month: 'October', year: 2026 },
    weekday: 'THU',
    period: 'day',
    schoolDay: true,
    weather: undefined,
    specialTags: [],
    ...overrides,
  }
}

describe('evaluateRules', () => {
  it('returns empty array when no rules match', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['MON'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    expect(evaluateRules(rules, ctx)).toEqual([])
  })

  it('returns matching rules', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    const result = evaluateRules(rules, ctx)
    expect(result).toHaveLength(1)
    expect(result[0].rule.id).toBe('r1')
  })

  it('skips disabled rules', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: false, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const ctx = makeContext({ weekday: 'THU' })
    expect(evaluateRules(rules, ctx)).toEqual([])
  })
})
