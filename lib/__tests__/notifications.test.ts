import { describe, it, expect } from 'vitest'
import { NOTIFICATION_MAX_DURATION, NOTIFICATION_MIN_DURATION, clampNotificationDuration, createDemoNotifications, formatNotificationTime, normalizeFrameNotifications } from '../notifications'

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

describe('formatNotificationTime', () => {
  it('pins locale and timezone so server and client render identical strings', () => {
    // Deterministic by construction: en-US + UTC, independent of the runtime's
    // default locale or timezone (this is what makes SSR safe).
    expect(formatNotificationTime('2026-10-11T08:56:00.000Z')).toBe('8:56 AM')
    expect(formatNotificationTime('2026-10-11T20:05:00.000Z')).toBe('8:05 PM')
  })

  it('returns a stable placeholder for unparseable input', () => {
    expect(formatNotificationTime('not-a-date')).toBe('—')
  })
})

describe('createDemoNotifications', () => {
  it('builds demo history from a fixed anchor so every runtime sees the same data', () => {
    const first = createDemoNotifications()
    const second = createDemoNotifications()

    expect(first).toHaveLength(3)
    expect(first).toEqual(second)
    // Ids are stable and the anchor is 4/12/36 minutes behind each event.
    expect(first.map((n) => n.id)).toEqual(['mock-maintenance', 'mock-sync', 'mock-offline'])
    expect(first[0].createdAt).toBe('2026-10-11T08:56:00.000Z')
    expect(first[1].createdAt).toBe('2026-10-11T08:48:00.000Z')
    expect(first[2].createdAt).toBe('2026-10-11T08:24:00.000Z')
  })

  it('produces notifications that pass normalization unchanged', () => {
    for (const notification of createDemoNotifications()) {
      const [normalized] = normalizeFrameNotifications([notification])
      expect(normalized).toBeDefined()
      expect(normalized.id).toBe(notification.id)
      expect(normalized.title).toBe(notification.title)
    }
  })
})
