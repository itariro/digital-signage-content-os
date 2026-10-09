import type { ScoredCandidate } from './types'

export interface SelectWinnerOptions {
  incumbentLayoutId?: string | null
  /** Challengers must beat the incumbent by this many points to switch. */
  hysteresis?: number
}

/**
 * Picks the winning candidate. Highest `score` wins; ties break on higher
 * `rule.priority`, then lexicographically on `rule.id`. When an incumbent
 * layout is supplied with a hysteresis margin, the incumbent is retained unless
 * a challenger clears that margin — this prevents 30-second flapping.
 *
 * Pure: the input array is never mutated.
 */
export function selectWinner(
  candidates: ScoredCandidate[],
  options: SelectWinnerOptions = {},
): ScoredCandidate | null {
  if (candidates.length === 0) return null

  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.rule.priority !== a.rule.priority) return b.rule.priority - a.rule.priority
    return a.rule.id.localeCompare(b.rule.id)
  })
  const best = sorted[0]

  const { incumbentLayoutId, hysteresis = 0 } = options
  if (incumbentLayoutId && hysteresis > 0) {
    const incumbent = sorted.find(candidate => candidate.layoutId === incumbentLayoutId)
    if (incumbent && incumbent.score + hysteresis >= best.score) return incumbent
  }
  return best
}
