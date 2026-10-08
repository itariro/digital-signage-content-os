import type { FrameStore, WeatherData, Weekday } from '../types'
import type { ExperienceContext } from './types'

const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function getPeriod(minutes: number): ExperienceContext['period'] {
  if (minutes < 360) return 'night'
  if (minutes < 525) return 'morning'
  if (minutes < 990) return 'day'
  if (minutes < 1110) return 'welcome-home'
  if (minutes < 1260) return 'evening'
  return 'wind-down'
}

function getSpecialTags(weather: WeatherData | undefined): string[] {
  if (!weather) return []
  const tags: string[] = []
  const rainProb = weather.daily[0]?.rainProbability ?? 0
  if (rainProb > 60) tags.push('rain')
  const temp = weather.current.temp
  if (temp > 30) tags.push('heat')
  if (temp < 5) tags.push('cold')
  if (weather.current.uv > 6) tags.push('uv')
  return tags
}

/**
 * Resolve `now` to the wall-clock time in `timezone`, returned as a Date whose
 * UTC getters yield that local wall time. Throws if `timezone` is not a valid
 * IANA zone.
 */
function zonedWallTime(now: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = formatter.formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0'
  // Rebuild the zoned wall-clock time as a UTC instant so getUTC* reads it back.
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  )
}

export function buildContext(
  store: FrameStore,
  now: Date,
  weather?: WeatherData
): ExperienceContext {
  const timezone = store.experiences.settings.timezone || 'UTC'

  let localDate: Date
  try {
    localDate = zonedWallTime(now, timezone)
  } catch {
    console.warn(`[context] Invalid timezone "${timezone}", falling back to server UTC`)
    localDate = now
  }

  const weekday = WEEKDAYS[localDate.getUTCDay()]
  const minutes = localDate.getUTCHours() * 60 + localDate.getUTCMinutes()
  const period = getPeriod(minutes)

  const iso = localDate.toISOString().slice(0, 10)
  const isWeekend = weekday === 'SAT' || weekday === 'SUN'
  const holidays = store.experiences.settings.schoolHolidays
  const schoolDay = !isWeekend && !holidays.includes(iso)

  return {
    now: localDate.toISOString(),
    date: {
      iso,
      day: localDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      dayNumber: localDate.getUTCDate(),
      month: localDate.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
      year: localDate.getUTCFullYear(),
    },
    weekday,
    period,
    schoolDay,
    weather,
    specialTags: getSpecialTags(weather),
  }
}
