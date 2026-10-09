import { describe, it, expect } from 'vitest'
import { parseZonedWallTime } from '../zoned-time'

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
