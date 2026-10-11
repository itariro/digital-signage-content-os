import type { EvaluatedRule } from './evaluator'
import type { ExperienceRule, HistoryEntry, HistorySummary, ScoredCandidate } from './types'

const NOVELTY_BONUS = 40
const WEATHER_RELEVANCE = 20

function getRepetitionPenalty(
  recent: HistoryEntry[],
  layoutId: string,
  currentLayoutId: string,
  nowMs: number,
): number {
  if (layoutId === currentLayoutId) return 0

  let latest = -Infinity
  for (const entry of recent) {
    if (entry.layoutId === layoutId) latest = Math.max(latest, entry.shownAt.getTime())
  }
  if (latest === -Infinity) return 0

  const age = nowMs - latest
  if (age < 5 * 60 * 1000) return 300
  if (age < 30 * 60 * 1000) return 150
  if (age < 120 * 60 * 1000) return 50
  return 0
}

function isEligibleByDuration(rule: ExperienceRule, recent: HistoryEntry[], nowMs: number): boolean {
  const duration = rule.then.durationMs
  if (!duration) return true
  let latest = -Infinity
  for (const entry of recent) {
    if (entry.ruleId === rule.id) latest = Math.max(latest, entry.shownAt.getTime())
  }
  return latest === -Infinity || nowMs - latest >= duration
}

export type SelectionMode = 'layout' | 'notification'

export function scoreCandidates(
  candidates: EvaluatedRule[],
  history: HistorySummary,
  currentLayoutId: string,
  nowMs: number = Date.now(),
  mode: SelectionMode = 'layout',
): ScoredCandidate[] {
  return candidates
    .filter(({ rule }) => isEligibleByDuration(rule, history.recent, nowMs))
    .map(({ rule, weatherMatched }) => {
      // Notification mode publishes speech only. Novelty and repetition penalties
      // measure layout *displays* — which no longer happen (live layouts are
      // schedule-driven) — so applying them would suppress the most relevant
      // rule's speech. `durationMs` still gates re-matching via eligibility.
      const notificationMode = mode === 'notification'
      const weatherRelevance = weatherMatched ? WEATHER_RELEVANCE : 0
      const novelty = !notificationMode && !history.seenLayouts.has(rule.then.layoutId) ? NOVELTY_BONUS : 0
      const penalty = notificationMode
        ? 0
        : getRepetitionPenalty(history.recent, rule.then.layoutId, currentLayoutId, nowMs)
      const score = rule.priority + rule.then.score + weatherRelevance + novelty - penalty
      return { rule, score, layoutId: rule.then.layoutId }
    })
}
