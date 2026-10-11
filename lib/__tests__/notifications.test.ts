import { describe, it, expect } from 'vitest'
import { NOTIFICATION_MAX_DURATION, NOTIFICATION_MIN_DURATION, clampNotificationDuration } from '../notifications'

describe('clampNotificationDuration', () => {
  it('passes through values already inside the bounds', () => {
    expect(clampNotificationDuration(30_000)).toBe(30_000)
    expect(clampNotificationDuration(2_500)).toBe(2_500)
    expect(clampNotificationDuration(60_000)).toBe(60_000)
  })

  it('raises values below the minimum', () => {
    expect(clampNotificationDuration(0)).toBe(2_500)
    expect(clampNotificationDuration(500)).toBe(2_500)
  })

  it('lowers values above the maximum', () => {
    expect(clampNotificationDuration(300_000)).toBe(60_000)
    expect(clampNotificationDuration(Number.POSITIVE_INFINITY)).toBe(60_000)
  })
})

describe('duration bounds', () => {
  it('exposes bounds matching the clamp', () => {
    expect(NOTIFICATION_MIN_DURATION).toBe(2_500)
    expect(NOTIFICATION_MAX_DURATION).toBe(60_000)
  })
})
