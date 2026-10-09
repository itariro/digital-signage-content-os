import { describe, it, expect } from 'vitest'
import { mergeDaysCondition, toggleWeekday } from '../experience-draft'

describe('mergeDaysCondition', () => {
  it('replaces a top-level days condition', () => {
    expect(mergeDaysCondition({ days: ['MON'] }, ['TUE', 'WED'])).toEqual({ days: ['TUE', 'WED'] })
  })

  it('preserves a sibling condition inside all', () => {
    const result = mergeDaysCondition({ all: [{ days: ['MON'] }, { time: { from: '09:00', to: '10:00' } }] }, ['THU'])
    expect(result).toEqual({ all: [{ days: ['THU'] }, { time: { from: '09:00', to: '10:00' } }] })
  })

  it('appends days to an all that has none', () => {
    const result = mergeDaysCondition({ all: [{ weather: { uvAbove: 5 } }] }, ['SAT'])
    expect(result).toEqual({ all: [{ weather: { uvAbove: 5 } }, { days: ['SAT'] }] })
  })

  it('wraps a non-composite condition without losing it', () => {
    expect(mergeDaysCondition({ weather: { rainProbabilityAbove: 60 } }, ['FRI'])).toEqual({
      all: [{ weather: { rainProbabilityAbove: 60 } }, { days: ['FRI'] }],
    })
  })
})

describe('toggleWeekday', () => {
  it('adds a missing day', () => {
    expect(toggleWeekday(['MON'], 'TUE', true)).toEqual(['MON', 'TUE'])
  })
  it('removes a present day', () => {
    expect(toggleWeekday(['MON', 'TUE'], 'MON', false)).toEqual(['TUE'])
  })
  it('is idempotent', () => {
    expect(toggleWeekday(['MON'], 'MON', true)).toEqual(['MON'])
  })
})
