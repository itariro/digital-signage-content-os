import { describe, it, expect } from 'vitest'
import { truncateToMinute, retentionCutoff } from '../history-utils'

describe('truncateToMinute', () => {
  it('drops seconds and milliseconds', () => {
    expect(truncateToMinute(new Date('2026-10-08T10:15:42.987Z')).toISOString()).toBe('2026-10-08T10:15:00.000Z')
  })
})

describe('retentionCutoff', () => {
  it('subtracts the retention window', () => {
    const now = new Date('2026-10-08T10:00:00.000Z')
    expect(retentionCutoff(now, 7 * 24 * 60 * 60 * 1000).toISOString()).toBe('2026-10-01T10:00:00.000Z')
  })
})
