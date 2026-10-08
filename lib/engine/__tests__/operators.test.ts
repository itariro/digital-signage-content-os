import { describe, it, expect } from 'vitest'
import { evaluateCondition } from '../operators'
import type { Condition, ExperienceContext } from '../types'

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

describe('evaluateCondition', () => {
  it('evaluates days condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ days: ['MON'] }, ctx)).toBe(true)
    expect(evaluateCondition({ days: ['TUE'] }, ctx)).toBe(false)
  })

  it('evaluates time condition', () => {
    const ctx = makeContext({ now: '2026-10-08T10:00:00Z' })
    expect(evaluateCondition({ time: { from: '09:00', to: '11:00' } }, ctx)).toBe(true)
    expect(evaluateCondition({ time: { from: '12:00', to: '14:00' } }, ctx)).toBe(false)
  })

  it('evaluates schoolDay condition', () => {
    const ctx = makeContext({ schoolDay: true })
    expect(evaluateCondition({ schoolDay: true }, ctx)).toBe(true)
    expect(evaluateCondition({ schoolDay: false }, ctx)).toBe(false)
  })

  it('evaluates weather rainProbabilityAbove', () => {
    const ctx = makeContext({
      weather: { sample: false, current: { temp: 15, code: 61, isDay: true, uv: 2 }, today: { high: 18, low: 10, uvMax: 3, sunrise: '', sunset: '' }, daily: [{ date: '2026-10-08', code: 61, max: 18, min: 10, rainProbability: 75 }], hourly: [] },
    })
    expect(evaluateCondition({ weather: { rainProbabilityAbove: 60 } }, ctx)).toBe(true)
    expect(evaluateCondition({ weather: { rainProbabilityAbove: 80 } }, ctx)).toBe(false)
  })

  it('evaluates specialTag condition', () => {
    const ctx = makeContext({ specialTags: ['rain', 'uv'] })
    expect(evaluateCondition({ specialTag: 'rain' }, ctx)).toBe(true)
    expect(evaluateCondition({ specialTag: 'heat' }, ctx)).toBe(false)
  })

  it('evaluates all condition', () => {
    const ctx = makeContext({ weekday: 'MON', schoolDay: true })
    expect(evaluateCondition({ all: [{ days: ['MON'] }, { schoolDay: true }] }, ctx)).toBe(true)
    expect(evaluateCondition({ all: [{ days: ['MON'] }, { schoolDay: false }] }, ctx)).toBe(false)
  })

  it('evaluates any condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ any: [{ days: ['TUE'] }, { days: ['MON'] }] }, ctx)).toBe(true)
    expect(evaluateCondition({ any: [{ days: ['TUE'] }, { days: ['WED'] }] }, ctx)).toBe(false)
  })

  it('evaluates not condition', () => {
    const ctx = makeContext({ weekday: 'MON' })
    expect(evaluateCondition({ not: { days: ['TUE'] } }, ctx)).toBe(true)
    expect(evaluateCondition({ not: { days: ['MON'] } }, ctx)).toBe(false)
  })
})
