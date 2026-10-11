import { describe, it, expect } from 'vitest'
import { experiencesSchema, safeParseExperiences } from '../schema'

const base = {
  enabled: true,
  settings: { schoolHolidays: [] },
}

function rule(id: string, when: unknown, then?: Record<string, unknown>) {
  return { id, name: id, enabled: true, priority: 100, when, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0, ...then } }
}

function nest(depth: number): unknown {
  let node: unknown = { specialTag: 'rain' }
  for (let i = 0; i < depth; i++) node = { all: [node] }
  return node
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

  it('rejects a duration above 24 hours', () => {
    const result = experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { durationMs: 1_000_000_000 })] })
    expect(result.success).toBe(false)
  })

  it('accepts a duration of exactly 24 hours', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { durationMs: 86_400_000 })] }).success).toBe(true)
  })

  it('rejects an out-of-range score', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: 1_000_000_000 })] }).success).toBe(false)
  })

  it('accepts scores at the bounds', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: 1000 })] }).success).toBe(true)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { days: ['MON'] }, { score: -1000 })] }).success).toBe(true)
  })

  it('rejects an unknown specialTag and accepts a known one', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { specialTag: 'snow' })] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { specialTag: 'rain' })] }).success).toBe(true)
  })

  it('rejects condition trees deeper than 10 levels', () => {
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', nest(11))] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', nest(10))] }).success).toBe(true)
  })

  it('rejects condition lists longer than 20 entries', () => {
    const long = { all: Array.from({ length: 21 }, () => ({ specialTag: 'rain' })) }
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', long)] }).success).toBe(false)
    expect(experiencesSchema.safeParse({ ...base, rules: [rule('r1', { all: Array.from({ length: 20 }, () => ({ specialTag: 'rain' })) })] }).success).toBe(true)
  })

  it('rejects pathological nesting without throwing (stack safety)', () => {
    // 2000 chained `not` nodes: deep enough that zod's recursive parse blows the
    // call stack, so the wrapper's pre-parse depth guard must reject it first.
    let deep: unknown = { specialTag: 'rain' }
    for (let i = 0; i < 2_000; i++) deep = { not: deep }
    const result = safeParseExperiences({ ...base, rules: [rule('r1', deep)] })
    expect(result.success).toBe(false)
  })
})
