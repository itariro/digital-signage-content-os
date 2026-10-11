import { describe, it, expect } from 'vitest'
import { formatZonedInputValue, parseZonedWallTime, resolveTimezone } from '../zoned-time'

describe('parseZonedWallTime', () => {
  it('interprets a naive time as wall time in the given zone', () => {
    // 18:15 in Zurich during CEST (UTC+2) is 16:15 UTC.
    const instant = parseZonedWallTime('2026-10-08T18:15', 'Europe/Zurich')
    expect(instant?.toISOString()).toBe('2026-10-08T16:15:00.000Z')
  })

  it('handles UTC', () => {
    expect(parseZonedWallTime('2026-10-08T18:15', 'UTC')?.toISOString()).toBe('2026-10-08T18:15:00.000Z')
  })

  it('returns null for malformed input', () => {
    expect(parseZonedWallTime('not-a-date', 'UTC')).toBeNull()
    expect(parseZonedWallTime('2026-10-08', 'UTC')).toBeNull()
  })

  it('returns null for an invalid zone', () => {
    expect(parseZonedWallTime('2026-10-08T18:15', 'Invalid/Zone')).toBeNull()
  })
})

describe('resolveTimezone', () => {
  it('returns a valid IANA zone unchanged', () => {
    expect(resolveTimezone('Europe/Zurich')).toBe('Europe/Zurich')
  })

  it('falls back to UTC for an invalid zone', () => {
    expect(resolveTimezone('Invalid/Zone')).toBe('UTC')
  })

  it('falls back to UTC when unset', () => {
    expect(resolveTimezone(undefined)).toBe('UTC')
  })

  it('formats an instant as YYYY-MM-DDTHH:mm in the target zone', () => {
    const instant = new Date('2026-10-11T21:30:00Z')
    expect(formatZonedInputValue(instant, 'UTC')).toBe('2026-10-11T21:30')
    expect(formatZonedInputValue(instant, 'Europe/Zurich')).toBe('2026-10-11T23:30')
  })
})
