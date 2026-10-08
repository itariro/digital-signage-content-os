import type { ExperienceRule, ExperienceContext } from './types'
import { evaluateCondition } from './operators'

export interface EvaluatedRule {
  rule: ExperienceRule
  weatherMatched: boolean
}

export function evaluateRules(rules: ExperienceRule[], ctx: ExperienceContext): EvaluatedRule[] {
  return rules
    .filter(rule => rule.enabled)
    .map(rule => ({
      rule,
      weatherMatched: 'weather' in rule.when ? evaluateCondition(rule.when, ctx) : false,
    }))
    .filter(({ rule }) => evaluateCondition(rule.when, ctx))
}
