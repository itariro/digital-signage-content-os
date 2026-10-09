import type { Condition, ExperienceRule, ExperienceContext } from './types'
import { evaluateCondition } from './operators'

export interface EvaluatedRule {
  rule: ExperienceRule
  weatherMatched: boolean
}

/**
 * True when at least one positive weather node inside the tree is satisfied.
 * Negated weather never earns relevance, so a rule that matched because it did
 * *not* rain is not rewarded as if it were weather-driven.
 */
function hasSatisfiedWeather(condition: Condition, ctx: ExperienceContext): boolean {
  if ('weather' in condition) return evaluateCondition(condition, ctx)
  if ('all' in condition) return condition.all.some(c => hasSatisfiedWeather(c, ctx))
  if ('any' in condition) {
    // Only credit branches that actually satisfied the disjunction; a weather
    // node inside a false branch did not drive the match.
    return condition.any
      .filter(c => evaluateCondition(c, ctx))
      .some(c => hasSatisfiedWeather(c, ctx))
  }
  return false
}

export function evaluateRules(rules: ExperienceRule[], ctx: ExperienceContext): EvaluatedRule[] {
  return rules
    .filter(rule => rule.enabled)
    .map(rule => ({ rule, weatherMatched: hasSatisfiedWeather(rule.when, ctx) }))
    .filter(({ rule }) => evaluateCondition(rule.when, ctx))
}
