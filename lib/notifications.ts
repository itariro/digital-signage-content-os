import type { FrameNotification } from './types'

export const NOTIFICATION_VARIANTS = ['info', 'success', 'warning', 'error', 'reminder'] as const

export const NOTIFICATION_DEFAULT_DURATION: Record<FrameNotification['variant'], number> = {
  info: 6000,
  success: 4500,
  warning: 9000,
  error: 12000,
  reminder: 15000,
}

export const NOTIFICATION_MIN_DURATION = 2500
export const NOTIFICATION_MAX_DURATION = 60_000

/** Clamps a raw duration to the range a kiosk card can usefully display. */
export function clampNotificationDuration(rawDuration: number): number {
  return Math.min(NOTIFICATION_MAX_DURATION, Math.max(NOTIFICATION_MIN_DURATION, rawDuration))
}

export function normalizeFrameNotifications(input: unknown): FrameNotification[] {
  if (!Array.isArray(input)) return []

  return input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const variant = NOTIFICATION_VARIANTS.includes(item.variant as FrameNotification['variant'])
        ? (item.variant as FrameNotification['variant'])
        : 'info'
      const title = typeof item.title === 'string' ? item.title.trim().slice(0, 120) : ''
      const message = typeof item.message === 'string' ? item.message.trim().slice(0, 280) : undefined
      const id = typeof item.id === 'string' ? item.id.trim().slice(0, 80) : ''
      const eventKey = typeof item.eventKey === 'string' ? item.eventKey.trim().slice(0, 120) : undefined
      const rawDuration = typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) ? item.durationMs : NOTIFICATION_DEFAULT_DURATION[variant]
      const durationMs = clampNotificationDuration(rawDuration)

      return {
        id,
        title,
        message,
        variant,
        durationMs,
        eventKey,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        actionUrl: typeof item.actionUrl === 'string' ? item.actionUrl.trim().slice(0, 500) : undefined,
      }
    })
    .filter((item) => item.id.length > 0 && item.title.length > 0)
    .filter((item) => !notificationIsExpired(item))
    .slice(0, 20)
}

export function notificationKey(notification: FrameNotification) {
  return notification.eventKey ?? notification.id
}

export const BOB_EVENT_KEY_PREFIX = 'bob:'

/** Render priority: errors first, then Bob cards, then everything else. */
function notificationDisplayRank(notification: FrameNotification): number {
  if (notification.variant === 'error') return 0
  if (notificationKey(notification).startsWith(BOB_EVENT_KEY_PREFIX)) return 1
  return 2
}

/**
 * Stable sort for display: error → Bob → other, preserving insertion order
 * within a tier. Pure; never mutates the input.
 */
export function sortNotificationsForDisplay(list: FrameNotification[]): FrameNotification[] {
  return list
    .map((item, index) => ({ item, index }))
    .sort((a, b) => notificationDisplayRank(a.item) - notificationDisplayRank(b.item) || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * The single merge used by every surface: latest-per-eventKey wins, expired
 * entries drop, and the KEEP set is the FIRST `limit` after priority sorting —
 * so high-priority cards are never evicted by volume (the previous
 * slice(-limit) dropped errors whenever more than `limit` cards were live).
 */
export function mergeNotificationList(
  current: FrameNotification[],
  incoming: FrameNotification[],
  limit = 8,
): FrameNotification[] {
  const byKey = new Map(current.map((item) => [notificationKey(item), item]))
  for (const item of incoming) byKey.set(notificationKey(item), item)
  return sortNotificationsForDisplay([...byKey.values()].filter((item) => !notificationIsExpired(item))).slice(0, limit)
}

export function notificationIsExpired(notification: FrameNotification, now = Date.now()) {
  const created = Date.parse(notification.createdAt)
  return Number.isFinite(created) && created + notification.durationMs <= now
}

export function notificationDuration(notification: FrameNotification) {
  const created = Date.parse(notification.createdAt)
  if (!Number.isFinite(created)) return notification.durationMs
  return Math.max(0, created + notification.durationMs - Date.now())
}

export function notificationTone(variant: FrameNotification['variant']) {
  if (variant === 'error') return 'border-destructive/60 bg-destructive/15'
  if (variant === 'warning') return 'border-accent/60 bg-accent/15'
  if (variant === 'success') return 'border-primary/60 bg-primary/15'
  return 'border-border/80 bg-card/95'
}

export function notificationIcon(variant: FrameNotification['variant']) {
  if (variant === 'error') return 'Error'
  if (variant === 'warning') return 'Warning'
  if (variant === 'success') return 'Complete'
  if (variant === 'reminder') return 'Reminder'
  return 'Info'
}

export type { FrameNotification }

/**
 * Fixed anchor for editor demo notification history. Demo data must not depend
 * on wall-clock time at module evaluation: the module loads separately on the
 * server (SSR) and the client (hydration), and `Date.now()` there produced
 * different timestamps per runtime — a hydration mismatch. An explicit anchor
 * keeps demo data identical in every runtime.
 */
const DEMO_NOTIFICATION_ANCHOR_MS = Date.parse('2026-10-11T09:00:00.000Z')

/**
 * Formats a notification timestamp for display. Locale and timezone are pinned
 * so the string is byte-identical on server and client — the runtime's default
 * locale ('9:39 PM' on the server vs '9:39 pm' in the browser) and timezone
 * differ, which is hydration-mismatch fuel in SSR'd client components.
 */
export function formatNotificationTime(createdAt: string): string {
  const time = new Date(createdAt)
  if (Number.isNaN(time.getTime())) return '—'
  return time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
}

/** Deterministic demo history for the editor's notification manager. */
export function createDemoNotifications(): FrameNotification[] {
  const minutesBefore = (minutes: number) => new Date(DEMO_NOTIFICATION_ANCHOR_MS - minutes * 60_000).toISOString()
  return [
    { id: 'mock-maintenance', title: 'Scheduled maintenance', message: 'The display will restart at 02:00 tonight.', variant: 'reminder', durationMs: 15000, createdAt: minutesBefore(4), eventKey: 'maintenance-02' },
    { id: 'mock-sync', title: 'Content synced', message: 'Your latest layout is now showing on the frame.', variant: 'success', durationMs: 4500, createdAt: minutesBefore(12), eventKey: 'sync-123' },
    { id: 'mock-offline', title: 'Connection interrupted', message: 'The frame is using its last known content.', variant: 'warning', durationMs: 9000, createdAt: minutesBefore(36), eventKey: 'offline-1' },
  ]
}
