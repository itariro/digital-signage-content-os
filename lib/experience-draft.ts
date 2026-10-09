import type { Condition, Weekday } from './types'

/**
 * Replaces or inserts a `days` condition without discarding any other
 * condition the rule already carries. The editor only exposes days, but rules
 * authored through the API may contain time/weather/composite conditions.
 */
export function mergeDaysCondition(when: Condition, days: Weekday[]): Condition {
  if ('days' in when) return { days }
  if ('all' in when) {
    const hasDays = when.all.some(condition => 'days' in condition)
    if (hasDays) {
      return { all: when.all.map(condition => ('days' in condition ? { days } : condition)) }
    }
    return { all: [...when.all, { days }] }
  }
  return { all: [when, { days }] }
}

export function toggleWeekday(days: Weekday[], day: Weekday, on: boolean): Weekday[] {
  if (on) return days.includes(day) ? days : [...days, day]
  return days.filter(existing => existing !== day)
}
