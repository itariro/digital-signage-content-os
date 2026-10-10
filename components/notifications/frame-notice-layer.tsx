'use client'

import { useNotifications } from './notification-provider'
import { notificationIcon, notificationTone } from '@/lib/notifications'

export function FrameNoticeLayer() {
  const { notifications } = useNotifications()

  if (notifications.length === 0) return null

  return (
    <section aria-label="Frame notifications" className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col items-center gap-3 px-12 pt-12">
      {notifications.map((notification) => {
        const liveRole = notification.variant === 'warning' || notification.variant === 'error' ? 'alert' : 'status'
        return (
          <article
            key={notification.id}
            role={liveRole}
            aria-live={liveRole === 'alert' ? 'assertive' : 'polite'}
            className={`w-full max-w-xl rounded-2xl border px-5 py-4 text-card-foreground shadow-2xl backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 ${notificationTone(notification.variant)}`}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {notificationIcon(notification.variant)}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-5 sm:text-base">{notification.title}</h2>
                {notification.message && <p className="mt-1 text-sm leading-5 text-muted-foreground">{notification.message}</p>}
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}
