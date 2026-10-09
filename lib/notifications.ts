import type { FrameNotification } from './types'

export const NOTIFICATION_VARIANTS = ['info', 'success', 'warning', 'error', 'reminder'] as const

export const NOTIFICATION_DEFAULT_DURATION: Record<FrameNotification['variant'], number> = {
  info: 6000,
  success: 4500,
  warning: 9000,
  error: 12000,
  reminder: 15000,
}

const MIN_DURATION = 2500
const MAX_DURATION = 60_000

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
      const durationMs = Math.min(MAX_DURATION, Math.max(MIN_DURATION, rawDuration))

      return {
        id,
        title,
        message,
        variant,
        durationMs,
        eventKey,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      }
    })
    .filter((item) => item.id.length > 0 && item.title.length > 0)
    .slice(0, 20)
}

export function notificationKey(notification: FrameNotification) {
  return notification.eventKey ?? notification.id
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
