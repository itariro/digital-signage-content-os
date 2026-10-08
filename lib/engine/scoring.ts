import type { Condition, ExperienceRule, HistoryEntry, ScoredCandidate } from './types'

const NOVELTY_BONUS = 40
const WEATHER_RELEVANCE = 20
const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Detects whether a condition references weather at any nesting level.
 *
 * The evaluator's `weatherMatched` flag only inspects top-level weather
 * conditions, so it is wrong for composites such as `all: [{ weather }, ...]`.
 * Scoring derives weather relevance directly from the rule's `when` tree.
 */
function hasWeatherCondition(condition: Condition): boolean {
  if ('weather' in condition) return true
  if ('all' in condition) return condition.all.some(hasWeatherCondition)
  if ('any' in condition) return condition.any.some(hasWeatherCondition)
  if ('not' in condition) return hasWeatherCondition(condition.not)
  return false
}

function getRepetitionPenalty(history: HistoryEntry[], layoutId: string): number {
  const now = Date.now()
  const recent = history
    .filter(h => h.layoutId === layoutId)
    .filter(h => now - h.shownAt.getTime() < 120 * 60 * 1000)
    .sort((a, b) => b.shownAt.getTime() - a.shownAt.getTime())[0]

  if (!recent) return 0

  const age = now - recent.shownAt.getTime()
  if (age < 5 * 60 * 1000) return 300
  if (age < 30 * 60 * 1000) return 150
  if (age < 120 * 60 * 1000) return 50
  return 0
}

function getNoveltyBonus(history: HistoryEntry[], layoutId: string): number {
  const now = Date.now()
  const recent = history.find(h => h.layoutId === layoutId && now - h.shownAt.getTime() < RETENTION_WINDOW_MS)
  return recent ? 0 : NOVELTY_BONUS
}

export function scoreCandidates(
  rules: ExperienceRule[],
  history: HistoryEntry[],
  _currentLayoutId: string
): ScoredCandidate[] {
  return rules.map(rule => {
    const weatherRelevance = hasWeatherCondition(rule.when) ? WEATHER_RELEVANCE : 0
    const novelty = getNoveltyBonus(history, rule.then.layoutId)
    const penalty = getRepetitionPenalty(history, rule.then.layoutId)
    const score = rule.priority + rule.then.score + weatherRelevance + novelty - penalty
    return { rule, score, layoutId: rule.then.layoutId }
  })
}
