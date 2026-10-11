'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CalendarDays, Check, Clock3, Cuboid, ListChecks, MapPin, QrCode, Route, Siren, X } from 'lucide-react'
import type { FrameNotification } from '@/lib/types'
import { useNotifications } from './notification-provider'
import { cn } from '@/lib/utils'

const MASCOTS = {
  warning: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_question-OdunhW9uNu1kPr4rCJsBe02fK8cX6P.png',
  reminder: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_reminder-Dc0ETqgLImrwnyAvw42SIgIzwdehIc.png',
  info: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_talking-cYnxVoO3XjmYrjUkonG5UudECS9cLR.png',
  success: 'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bob_planning-ezfCxbQyuDAwprCpdbMxzXudAPeeEC.png',
} as const

type NoticeProps = { notification: FrameNotification; onDismiss: (id: string) => void }

function ProgressTimer({ durationMs, onComplete }: { durationMs: number; onComplete: () => void }) {
  const [startedAt] = useState(() => Date.now())
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (durationMs <= 0) return
    const timer = window.setInterval(() => {
      const next = Math.min(1, (Date.now() - startedAt) / durationMs)
      setProgress(next)
      if (next >= 1) {
        window.clearInterval(timer)
        onComplete()
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [durationMs, onComplete, startedAt])
  return <div aria-hidden className="h-3 w-36 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-black transition-[width] duration-75" style={{ width: `${progress * 100}%` }} /></div>
}

const NOTICE_TOKENS = {
  framePadding: 'clamp(24px, 3.5cqw, 68px)',
  cardRadius: 'clamp(24px, 3.2cqw, 62px)',
  surfaceRadius: 'clamp(16px, 2cqw, 36px)',
} as const

function CategoryPill({ notification }: { notification: FrameNotification }) {
  const label = notification.variant === 'warning' || notification.variant === 'error' ? 'Warning' : notification.variant === 'reminder' ? 'Today\'s the day' : notification.variant === 'success' ? 'Calendar' : 'System Message'
  const Icon = notification.variant === 'warning' || notification.variant === 'error' ? AlertTriangle : notification.variant === 'reminder' ? Bell : notification.variant === 'success' ? CalendarDays : Bell
  return <div className="inline-flex w-fit items-center gap-[1.2cqw] rounded-full bg-[#d8eaf1] px-[2.2cqw] py-[1.1cqh] text-[clamp(18px,2.2cqw,42px)] font-medium leading-none text-black"><Icon className="size-[1.05em]" aria-hidden />{label}</div>
}

function Metadata({ notification }: { notification: FrameNotification }) {
  const isError = notification.variant === 'warning' || notification.variant === 'error'
  const items = isError
    ? [['code', notification.eventKey ? `Error ${notification.eventKey}` : 'Error Code', Route], ['module', 'Module with the code', Cuboid]] as const
    : [['time', 'Sun, 11 Oct 2026 09:21', Clock3], ['location', 'Clifton Springs, VIC', MapPin]] as const
  return <div className="flex flex-col gap-[2.5cqh] text-[clamp(20px,2.1cqw,40px)] text-black">{items.map(([key, value, Icon]) => <div className="flex items-center gap-5" key={key}><Icon className="size-[1.8em] shrink-0" strokeWidth={2.5} aria-hidden /><span>{value}</span></div>)}</div>
}

function QrPanel({ value }: { value: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(value)}`
  return <div className="flex w-[clamp(8rem,25%,14rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/10"><img src={src} alt="Scannable notification QR code" className="aspect-square w-full object-contain p-2" /><div className="bg-black px-2 py-2 text-center text-[clamp(0.7rem,1.6vw,1.1rem)] font-semibold text-white">SCAN ME</div></div>
}

function NoticeCard({ notification, onDismiss }: NoticeProps) {
  const [paused, setPaused] = useState(false)
  const isError = notification.variant === 'warning' || notification.variant === 'error'
  const isCalendar = notification.variant === 'success'
  const isSystem = notification.variant === 'info'
  const background = isError ? 'bg-[#f8dff0]' : isCalendar ? 'bg-[#dff4fb]' : notification.variant === 'reminder' ? 'bg-[#fffed0]' : 'bg-[#dff4fb]'
  const mascot = MASCOTS[notification.variant === 'error' ? 'warning' : notification.variant]
  const onTimerComplete = useMemo(() => () => { if (!paused) onDismiss(notification.id) }, [notification.id, onDismiss, paused])

  return <article role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'} className="pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-[clamp(24px,3.2cqw,62px)] bg-white text-black shadow-2xl ring-1 ring-black/10">
    <div className={cn('relative min-h-0 flex-1 overflow-hidden p-[clamp(24px,3.5cqw,68px)]', background)}>
      <div className="relative z-10 flex h-full min-h-0 flex-col gap-[clamp(24px,3cqh,72px)] pr-[clamp(0px,22cqw,360px)]">
        <CategoryPill notification={notification} />
        <div><h2 className="max-w-[90%] text-[clamp(30px,5.2cqw,100px)] font-semibold leading-[1.05] tracking-[-0.04em]">{notification.title}</h2>{notification.message && <p className="mt-[2cqh] max-w-[62ch] text-[clamp(20px,2.5cqw,48px)] leading-[1.18] text-[#5f5b62]">{notification.message}</p>}</div>
        <div className="mt-auto"><Metadata notification={notification} /></div>
      </div>
      {mascot && <img src={mascot} alt="" aria-hidden className="pointer-events-none absolute bottom-[3%] right-[2%] max-h-[78%] w-[32%] object-contain object-bottom" />}
      {isSystem && notification.actionUrl && <div className="absolute bottom-[5%] right-[3%]"><QrPanel value={notification.actionUrl} /></div>}
      {isSystem && !notification.actionUrl && <div className="absolute bottom-[8%] right-[4%] rounded-2xl bg-white/60 p-5 text-center text-sm text-black/60"><QrCode className="mx-auto mb-2 size-8" aria-hidden />QR unavailable</div>}
      {isSystem && <div className="absolute bottom-[6%] left-[clamp(1rem,4vw,3.5rem)] flex items-center gap-3 text-[clamp(0.8rem,2vw,1.25rem)] font-bold"><Siren className="size-[1.6em]" aria-hidden />Important/Urgent</div>}
    </div>
    {isError && <div className="mx-[clamp(0.75rem,2vw,1.5rem)] my-[clamp(0.75rem,2vw,1.5rem)] flex items-center gap-5 rounded-2xl border border-black/15 p-[clamp(0.75rem,2vw,1.5rem)] text-[clamp(0.8rem,2vw,1.2rem)]"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#d6f3e6]"><Check className="size-8" aria-hidden /></span><span>{notification.resolution ?? 'The resolution will appear here for the user to know how to fix it.'}</span></div>}
    {isCalendar && <div className="mx-[clamp(0.75rem,2vw,1.5rem)] mb-[clamp(0.75rem,2vw,1.5rem)] overflow-hidden rounded-2xl border border-black/15"><div className="flex items-center gap-4 border-b border-black/10 p-5"><span className="grid size-12 place-items-center rounded-2xl bg-[#fde8f0]"><ListChecks className="size-7" aria-hidden /></span><span className="font-medium">2 items</span><span className="ml-auto">14:00 – 15:30</span></div><div className="flex items-center gap-4 p-5"><span className="grid size-12 place-items-center rounded-2xl bg-[#d6f3e6]"><CalendarDays className="size-7" aria-hidden /></span><span className="font-medium">Event Name, Location</span><span className="ml-auto">14:00 – 15:30</span></div></div>}
    <footer className="flex items-center justify-end gap-3 px-[clamp(0.75rem,2vw,1.5rem)] pb-[clamp(0.75rem,2vw,1.5rem)]"><button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? 'Resume notification timer' : 'Pause notification timer'} className="rounded-full bg-black px-8 py-3 text-sm font-semibold text-white">{paused ? 'Resume' : 'Pause'}</button>{notification.durationMs > 0 && !paused && <ProgressTimer durationMs={notification.durationMs} onComplete={onTimerComplete} />}<button type="button" onClick={() => onDismiss(notification.id)} aria-label="Dismiss notification" className="rounded-full bg-black/5 p-3"><X className="size-5" aria-hidden /></button></footer>
  </article>
}

export function FrameNoticeLayer() {
  const { notifications, dismiss } = useNotifications()
  if (notifications.length === 0) return null
  return <section aria-label="Frame notifications" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden p-[clamp(24px,2.5cqw,48px)]"><div className="flex h-full w-full max-w-[min(100%,72rem)] flex-col justify-center gap-4">{notifications.slice(0, 1).map((notification) => <NoticeCard key={notification.id} notification={notification} onDismiss={dismiss} />)}</div></section>
}
