'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  mergeNotificationList,
  normalizeFrameNotifications,
  notificationDuration,
  notificationIsExpired,
  type FrameNotification,
} from '@/lib/notifications'

type NotificationContextValue = {
  notifications: FrameNotification[]
  publish: (notification: FrameNotification) => void
  dismiss: (id: string) => void
  clear: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)
const EMPTY_NOTIFICATIONS: unknown[] = []

export function NotificationProvider({ notifications:   sourceNotifications = EMPTY_NOTIFICATIONS,
 children }: { notifications?: unknown; children: ReactNode }) {
  const [notifications, setNotifications] = useState<FrameNotification[]>(() =>
    mergeNotificationList([], normalizeFrameNotifications(sourceNotifications)),
  )

  useEffect(() => {
    const incoming = normalizeFrameNotifications(sourceNotifications)
    setNotifications((current) => mergeNotificationList(current, incoming))
  }, [sourceNotifications])

  useEffect(() => {
    if (notifications.length === 0) return
    const nextExpiry = Math.min(...notifications.map((item) => notificationDuration(item)))
    const timer = window.setTimeout(() => {
      setNotifications((current) => current.filter((item) => !notificationIsExpired(item)))
    }, Math.max(50, nextExpiry))
    return () => window.clearTimeout(timer)
  }, [notifications])

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      publish: (notification) => setNotifications((current) => mergeNotificationList(current, [notification])),
      dismiss: (id) => setNotifications((current) => current.filter((item) => item.id !== id)),
      clear: () => setNotifications([]),
    }),
    [notifications],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider')
  return context
}
