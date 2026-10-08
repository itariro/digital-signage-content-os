import type { ScoredCandidate } from './types'

/**
 * Picks the winning candidate from a list of scored rules.
 *
 * Ordering:
 *  1. Highest `score` wins.
 *  2. Ties break on higher `rule.priority`.
 *  3. Remaining ties break lexicographically on `rule.id`.
 *
 * Pure: the input array is never mutated.
 */
export function selectWinner(candidates: ScoredCandidate[]): ScoredCandidate | null {
  if (candidates.length === 0) return null

  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority
    return a.rule.id.localeCompare(b.rule.id)
  })[0]
}
