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

function rule(when: ExperienceRule['when']): ExperienceRule {
  return { id: 'r1', name: 'Test', enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } }
}

describe('evaluateRules', () => {
  it('returns empty array when no rules match', () => {
    expect(evaluateRules([rule({ days: ['MON'] })], makeContext({ weekday: 'THU' }))).toEqual([])
  })

  it('returns matching rules', () => {
    const result = evaluateRules([rule({ days: ['THU'] })], makeContext({ weekday: 'THU' }))
    expect(result).toHaveLength(1)
    expect(result[0].rule.id).toBe('r1')
  })

  it('skips disabled rules', () => {
    const disabled = { ...rule({ days: ['THU'] }), enabled: false }
    expect(evaluateRules([disabled], makeContext({ weekday: 'THU' }))).toEqual([])
  })

  it('marks weatherMatched when a weather node is satisfied', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 61, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 75 }], hourly: [] },
    })
    const result = evaluateRules([rule({ all: [{ days: ['THU'] }, { weather: { rainProbabilityAbove: 60 } }] })], ctx)
    expect(result[0].weatherMatched).toBe(true)
  })

  it('does not mark weatherMatched when an any-branch matched for another reason', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 1, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 1, max: 18, min: 10, rainProbability: 10 }], hourly: [] },
    })
    const result = evaluateRules([rule({ any: [{ days: ['THU'] }, { weather: { rainProbabilityAbove: 60 } }] })], ctx)
    expect(result).toHaveLength(1)
    expect(result[0].weatherMatched).toBe(false)
  })

  it('does not credit weather from an unsatisfied any-branch that contains it', () => {
    const ctx = makeContext({
      weekday: 'TUE',
      weather: { sample: false, current: { temp: 15, code: 61, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 75 }], hourly: [] },
    })
    // Branch 1 contains a satisfied weather node but fails on its day; branch 2
    // matches. The rule matches via TUE, so weather must not earn relevance.
    const result = evaluateRules(
      [rule({ any: [{ all: [{ weather: { rainProbabilityAbove: 60 } }, { days: ['MON'] }] }, { days: ['TUE'] }] })],
      ctx,
    )
    expect(result).toHaveLength(1)
    expect(result[0].weatherMatched).toBe(false)
  })
})
