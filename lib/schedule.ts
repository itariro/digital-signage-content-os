import type { FrameSchedule, FrameStore, Layout, ScheduleRule } from './types'

export const DEFAULT_SCHEDULE: FrameSchedule = {
  enabled: false,
  rules: [],
  night: { enabled: false, start: '22:30', end: '06:30', brightness: 35, warmth: 40, hideSeconds: true },
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export type ClockParts = { day: number; minutes: number }

export function toMinutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function clockParts(date: Date, timeZone?: string): ClockParts {
  if (!timeZone) return { day: date.getDay(), minutes: date.getHours() * 60 + date.getMinutes() }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const day = DAY_LABELS.findIndex((d) => d === get('weekday'))
  return { day: Math.max(0, day), minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

export function inWindow(now: ClockParts, start: string, end: string, days?: number[]) {
  const s = toMinutes(start)
  const e = toMinutes(end)
  const allows = (day: number) => !days || days.includes(day)
  if (s === e) return allows(now.day)
  if (s < e) return allows(now.day) && now.minutes >= s && now.minutes < e
  if (now.minutes >= s) return allows(now.day)
  if (now.minutes < e) return allows((now.day + 6) % 7)
  return false
}

export type ResolvedDisplay = {
  layout: Layout | null
  rule: ScheduleRule | null
  night: boolean
}

export function resolveDisplay(store: Pick<FrameStore, 'activeId' | 'layouts' | 'schedule'>, now: ClockParts): ResolvedDisplay {
  const schedule = store.schedule ?? DEFAULT_SCHEDULE
  const fallback = store.layouts.find((l) => l.id === store.activeId) ?? store.layouts[0] ?? null
  let layout = fallback
  let rule: ScheduleRule | null = null
  if (schedule.enabled) {
    for (const r of schedule.rules) {
      const match = store.layouts.find((l) => l.id === r.layoutId)
      if (match && inWindow(now, r.start, r.end, r.days)) {
        layout = match
        rule = r
        break
      }
    }
  }
  const night = schedule.night.enabled && inWindow(now, schedule.night.start, schedule.night.end)
  return { layout, rule, night }
}

export function describeDays(days: number[]) {
  const sorted = [...days].sort()
  if (sorted.length === 7) return 'Every day'
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays'
  if (sorted.join() === '0,6') return 'Weekends'
  if (sorted.length === 0) return 'No days'
  return sorted.map((d) => DAY_LABELS[d]).join(', ')
}
