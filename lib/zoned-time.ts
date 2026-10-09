const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * Interprets a timezone-less ISO wall time (`2026-10-08T18:15`) as the wall
 * clock in `timezone` and returns the corresponding instant. Returns null for
 * malformed input or an invalid zone.
 *
 * The offset is resolved by formatting the candidate instant back into the
 * target zone and measuring the difference. DST-ambiguous times resolve to the
 * offset in effect at the candidate instant, which is acceptable for preview.
 */
export function parseZonedWallTime(value: string, timezone: string): Date | null {
  const match = NAIVE.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const asUTC = Date.UTC(+year, +month - 1, +day, +hour, +minute, +(second ?? 0))

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(asUTC))
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0')
    const zonedAsUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    const offset = zonedAsUTC - asUTC
    return new Date(asUTC - offset)
  } catch {
    return null
  }
}

/** Returns the zone if it is a valid IANA zone, else logs and returns 'UTC'. */
export function resolveTimezone(timezone?: string): string {
  if (!timezone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    console.warn(`[zoned-time] Invalid timezone "${timezone}", falling back to UTC`)
    return 'UTC'
  }
}

/** Formats a Date as a `datetime-local` value in the browser's local zone. */
export function formatLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
