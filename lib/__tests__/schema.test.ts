import { describe, it, expect } from 'vitest'
import { experiencesSchema } from '../schema'

const base = {
  enabled: true,
  settings: { schoolHolidays: [] },
}

function rule(id: string, when: unknown) {
  return { id, name: id, enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } }
}

describe('experiencesSchema', () => {
  it('accepts a valid rule', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] })] }).success).toBe(true)
  })

  it('rejects duplicate rule ids', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('dup', { days: ['MON'] }), rule('dup', { days: ['TUE'] })] })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid time format', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('r1', { time: { from: '25:99', to: '08:00' } })] })
    expect(result.success).toBe(false)
  })

  it('accepts a valid time format', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { time: { from: '06:00', to: '08:45' } })] }).success).toBe(true)
  })
})
