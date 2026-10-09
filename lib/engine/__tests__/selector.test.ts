import { describe, it, expect } from 'vitest'
import { selectWinner } from '../selector'
import type { ScoredCandidate, ExperienceRule } from '../types'

function makeRule(id: string, priority: number): ExperienceRule {
  return { id, name: id, enabled: true, priority, when: { days: ['THU'] }, then: { layoutId: `l-${id}`, state: 'ambient', score: 0, durationMs: 0 } }
}

describe('selectWinner', () => {
  it('returns the highest scoring candidate', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
      { rule: makeRule('r2', 200), score: 200, layoutId: 'l-r2' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r2')
  })

  it('tie-breaks by priority', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
      { rule: makeRule('r2', 200), score: 100, layoutId: 'l-r2' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r2')
  })

  it('tie-breaks by rule id when priority is equal', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('r2', 100), score: 100, layoutId: 'l-r2' },
      { rule: makeRule('r1', 100), score: 100, layoutId: 'l-r1' },
    ]
    const winner = selectWinner(candidates)
    expect(winner?.rule.id).toBe('r1')
  })

  it('returns null for empty candidates', () => {
    expect(selectWinner([])).toBeNull()
  })
})

describe('selectWinner with incumbent', () => {
  it('keeps the incumbent when a challenger does not clear the hysteresis margin', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('challenger', 100), score: 140, layoutId: 'l-challenger' },
      { rule: makeRule('incumbent', 100), score: 130, layoutId: 'l-incumbent' },
    ]
    const winner = selectWinner(candidates, { incumbentLayoutId: 'l-incumbent', hysteresis: 25 })
    expect(winner?.layoutId).toBe('l-incumbent')
  })

  it('switches when the challenger clears the margin', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('challenger', 100), score: 200, layoutId: 'l-challenger' },
      { rule: makeRule('incumbent', 100), score: 130, layoutId: 'l-incumbent' },
    ]
    const winner = selectWinner(candidates, { incumbentLayoutId: 'l-incumbent', hysteresis: 25 })
    expect(winner?.layoutId).toBe('l-challenger')
  })

  it('ignores the incumbent option when not supplied', () => {
    const candidates: ScoredCandidate[] = [
      { rule: makeRule('a', 100), score: 140, layoutId: 'l-a' },
      { rule: makeRule('b', 100), score: 130, layoutId: 'l-b' },
    ]
    expect(selectWinner(candidates)?.layoutId).toBe('l-a')
  })
})
