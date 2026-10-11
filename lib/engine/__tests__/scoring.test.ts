import { describe, it, expect } from 'vitest'
import { scoreCandidates } from '../scoring'
import type { EvaluatedRule } from '../evaluator'
import type { ExperienceRule, HistorySummary } from '../types'

function ev(rule: ExperienceRule, weatherMatched = false): EvaluatedRule {
  return { rule, weatherMatched }
}

type RuleOverrides = Omit<Partial<ExperienceRule>, 'then'> & { then?: Partial<ExperienceRule['then']> }

function rule(overrides: RuleOverrides = {}): ExperienceRule {
  const { then, ...rest } = overrides
  return {
    id: 'r1', name: 'Test', enabled: true, priority: 100, when: { days: ['THU'] },
    ...rest,
    then: { layoutId: 'l1', state: 'ambient', score: 0, durationMs: 0, ...then },
  }
}

function summary(partial: Partial<HistorySummary> = {}): HistorySummary {
  return { recent: [], seenLayouts: new Set<string>(), latestLayoutId: null, ...partial }
}

const NOW = Date.parse('2026-10-08T10:00:00Z')
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000)

describe('scoreCandidates', () => {
  it('computes base score with cold-start novelty', () => {
    const result = scoreCandidates([ev(rule())], summary(), '', NOW)
    expect(result[0].score).toBe(140) // 100 + 0 + 0 + 40 - 0
  })

  it('adds weather relevance only when weather was satisfied', () => {
    const [matched] = scoreCandidates([ev(rule(), true)], summary(), '', NOW)
    const [unmatched] = scoreCandidates([ev(rule(), false)], summary(), '', NOW)
    expect(matched.score - unmatched.score).toBe(20)
  })

  it('withdraws novelty for a layout seen within retention', () => {
    const result = scoreCandidates([ev(rule())], summary({ seenLayouts: new Set(['l1']) }), '', NOW)
    expect(result[0].score).toBe(100)
  })

  it('applies the repetition ladder from recent history', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'other', shownAt: minutesAgo(3) }]
    const result = scoreCandidates([ev(rule())], summary({ recent, seenLayouts: new Set(['l1']) }), '', NOW)
    expect(result[0].score).toBe(-200) // 100 - 300
  })

  it('does not penalise the incumbent layout', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(3) }]
    const result = scoreCandidates([ev(rule())], summary({ recent, seenLayouts: new Set(['l1']), latestLayoutId: 'l1' }), 'l1', NOW)
    expect(result[0].score).toBe(100) // no -300 because it is already showing
  })

  it('suppresses a rule still inside its durationMs window', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(10) }]
    const suppressed = scoreCandidates(
      [ev(rule({ id: 'r1', then: { durationMs: 60 * 60 * 1000 } }))],
      summary({ recent }),
      '',
      NOW,
    )
    expect(suppressed).toHaveLength(0)
  })

  it('allows a rule once its durationMs window has elapsed', () => {
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(90) }]
    const allowed = scoreCandidates(
      [ev(rule({ id: 'r1', then: { durationMs: 60 * 60 * 1000 } }))],
      summary({ recent }),
      '',
      NOW,
    )
    expect(allowed).toHaveLength(1)
  })

  it('still applies the durationMs cooldown in notification mode', () => {
    // Notification mode ignores novelty/repetition scoring, but not eligibility:
    // durationMs is the sole cooldown that stops the same speech repeating.
    const long = rule({ id: 'r1', then: { durationMs: 30 * 60 * 1000 } })
    const recent = [{ layoutId: 'l1', ruleId: 'r1', shownAt: minutesAgo(10) }]
    const suppressed = scoreCandidates([ev(long)], summary({ recent }), '', NOW, 'notification')
    expect(suppressed).toHaveLength(0)

    const cold = scoreCandidates([ev(long)], summary(), '', NOW, 'notification')
    expect(cold).toHaveLength(1)
  })
})
