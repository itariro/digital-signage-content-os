export interface StandbyScheduleInput {
  enabled: boolean
  start: string
  end: string
}

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export function isInStandbyWindow(now: Date, schedule: StandbyScheduleInput): boolean {
  if (!schedule.enabled) return false
  const start = toMinutes(schedule.start)
  const end = toMinutes(schedule.end)
  const current = now.getHours() * 60 + now.getMinutes()
  if (start === end) return false
  if (start < end) return current >= start && current < end
  return current >= start || current < end
}

export interface Transition {
  type: 'standby-start' | 'standby-end'
  at: Date
}

export function nextTransition(now: Date, schedule: StandbyScheduleInput): Transition | null {
  if (!schedule.enabled) return null
  if (!/^\d{2}:\d{2}$/.test(schedule.start) || !/^\d{2}:\d{2}$/.test(schedule.end)) return null
  const start = toMinutes(schedule.start)
  const end = toMinutes(schedule.end)
  const current = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  let targetMinutes: number
  let type: Transition['type']
  let daysAhead = 0
  if (isInStandbyWindow(now, schedule)) {
    targetMinutes = end
    type = 'standby-end'
    if (end <= current) daysAhead = 1
  } else {
    targetMinutes = start
    type = 'standby-start'
    if (start <= current) daysAhead = 1
  }
  const at = new Date(now.getTime())
  at.setDate(at.getDate() + daysAhead)
  at.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0)
  return { type, at }
}

export function formatTransition(t: Transition | null): string {
  if (!t) return 'none'
  return `${t.type} at ${t.at.toLocaleString()}`
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export function validateSchedule(schedule: StandbyScheduleInput): string[] {
  const errors: string[] = []
  if (!TIME_RE.test(schedule.start)) errors.push('start must be HH:MM (24h)')
  if (!TIME_RE.test(schedule.end)) errors.push('end must be HH:MM (24h)')
  if (schedule.start === schedule.end) errors.push('start and end must differ')
  return errors
}

export function describeStandby(schedule: StandbyScheduleInput): string {
  if (!schedule.enabled) return 'disabled'
  return `${schedule.start}-${schedule.end} (${schedule.enabled ? 'enabled' : 'disabled'})`
}
