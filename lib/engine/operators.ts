import type { Condition, ExperienceContext } from './types'

export function evaluateCondition(condition: Condition, ctx: ExperienceContext): boolean {
  if ('all' in condition) {
    return condition.all.every(c => evaluateCondition(c, ctx))
  }
  if ('any' in condition) {
    return condition.any.some(c => evaluateCondition(c, ctx))
  }
  if ('not' in condition) {
    return !evaluateCondition(condition.not, ctx)
  }
  if ('days' in condition) {
    return condition.days.includes(ctx.weekday)
  }
  if ('time' in condition) {
    const [fromH, fromM] = condition.time.from.split(':').map(Number)
    const [toH, toM] = condition.time.to.split(':').map(Number)
    const fromMinutes = fromH * 60 + fromM
    const toMinutes = toH * 60 + toM
    const nowMinutes = new Date(ctx.now).getUTCHours() * 60 + new Date(ctx.now).getUTCMinutes()
    if (fromMinutes <= toMinutes) {
      return nowMinutes >= fromMinutes && nowMinutes < toMinutes
    }
    return nowMinutes >= fromMinutes || nowMinutes < toMinutes
  }
  if ('schoolDay' in condition) {
    return ctx.schoolDay === condition.schoolDay
  }
  if ('weather' in condition) {
    const w = condition.weather
    if (!ctx.weather) return false
    if (w.rainProbabilityAbove !== undefined) {
      const rainProb = ctx.weather.daily[0]?.rainProbability ?? 0
      if (rainProb <= w.rainProbabilityAbove) return false
    }
    if (w.temperatureAbove !== undefined) {
      if (ctx.weather.current.temp <= w.temperatureAbove) return false
    }
    if (w.temperatureBelow !== undefined) {
      if (ctx.weather.current.temp >= w.temperatureBelow) return false
    }
    if (w.uvAbove !== undefined) {
      if (ctx.weather.current.uv <= w.uvAbove) return false
    }
    return true
  }
  if ('specialTag' in condition) {
    return ctx.specialTags.includes(condition.specialTag)
  }
  return false
}
