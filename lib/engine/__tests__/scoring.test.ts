import { describe, it, expect } from 'vitest'
import { scoreCandidates } from '../scoring'
import type { ExperienceRule, HistoryEntry } from '../types'

// Note on expectations:
// The plan's draft expectations contained arithmetic errors that contradict both
// the implementation it specified and the design spec. Corrected here:
//   - empty history still earns the +40 novelty bonus (cold-start boost)
//   - a layout shown 5 minutes ago is inside the 7-day novelty window (no bonus)
//     and falls into the 5-30 min rung of the repetition ladder (150, not 0)
//   - "no repetition penalty" requires a layout older than the 120 min window

describe('scoreCandidates', () => {
  it('computes base score from priority and then.score', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 10, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = []
    const result = scoreCandidates(rules, history, 'l1')
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(150) // 100 + 10 + 0 (weather) + 40 (novelty) - 0 (penalty)
  })

  it('adds weather relevance when the rule has a top-level weather condition', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { weather: { rainProbabilityAbove: 60 } }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = []
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(160) // 100 + 0 + 20 (weather) + 40 (novelty) - 0
  })

  it('adds weather relevance for composite conditions containing weather at any depth', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { all: [{ days: ['THU'] }, { any: [{ not: { weather: { uvAbove: 5 } } }] }] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = []
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(160) // 100 + 0 + 20 (weather) + 40 (novelty) - 0
  })

  it('applies the 300 repetition penalty for a layout shown under 5 minutes ago', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'l1', shownAt: new Date(Date.now() - 3 * 60 * 1000) }, // 3 minutes ago
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(-200) // 100 + 0 + 0 + 0 (no novelty) - 300 (penalty)
  })

  it('applies the 150 repetition penalty for a layout shown 5-30 minutes ago', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'l1', shownAt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 minutes ago
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(-50) // 100 + 0 + 0 + 0 (no novelty) - 150 (penalty)
  })

  it('applies no repetition penalty for a layout shown more than 120 minutes ago', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'l1', shownAt: new Date(Date.now() - 3 * 60 * 60 * 1000) }, // 3 hours ago
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(100) // 100 + 0 + 0 + 0 (no novelty, within 7 days) - 0 (no penalty)
  })

  it('awards the novelty bonus when the layout is absent from history', () => {
    const rules: ExperienceRule[] = [
      { id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] }, then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0 } },
    ]
    const history: HistoryEntry[] = [
      { layoutId: 'other', shownAt: new Date(Date.now() - 3 * 60 * 1000) }, // different layout
    ]
    const result = scoreCandidates(rules, history, 'l1')
    expect(result[0].score).toBe(140) // 100 + 0 + 0 + 40 (novelty) - 0 (penalty)
  })
})
