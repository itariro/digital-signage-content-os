'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  normalizeFrameNotifications,
  notificationDuration,
  notificationIsExpired,
  notificationKey,
  type FrameNotification,
} from '@/lib/notifications'

type NotificationContextValue = {
  notifications: FrameNotification[]
  publish: (notification: FrameNotification) => void
  dismiss: (id: string) => void
  clear: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

function mergeNotifications(current: FrameNotification[], incoming: FrameNotification[]) {
  const byKey = new Map(current.map((item) => [notificationKey(item), item]))
  for (const item of incoming) byKey.set(notificationKey(item), item)
  return [...byKey.values()]
    .filter((item) => !notificationIsExpired(item))
    .sort((a, b) => Number(b.variant === 'error') - Number(a.variant === 'error'))
    .slice(-8)
}

export function NotificationProvider({ notifications: sourceNotifications = [], children }: { notifications?: unknown; children: ReactNode }) {
  const [notifications, setNotifications] = useState<FrameNotification[]>(() =>
    mergeNotifications([], normalizeFrameNotifications(sourceNotifications)),
  )

  useEffect(() => {
    const incoming = normalizeFrameNotifications(sourceNotifications)
    setNotifications((current) => mergeNotifications(current, incoming))
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
      publish: (notification) => setNotifications((current) => mergeNotifications(current, [notification])),
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
