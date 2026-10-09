'use client'

import { useMemo, useState } from 'react'
import { Bell, CheckCircle2, ChevronRight, CircleAlert, Clock3, Info, Megaphone, Pause, Play, RotateCcw, Settings2, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import type { FrameNotification } from '@/lib/types'
import { NOTIFICATION_DEFAULT_DURATION } from '@/lib/notifications'
import { cn } from '@/lib/utils'

type NotificationPanelProps = {
  notifications: FrameNotification[]
}

type MockNotification = FrameNotification & { read: boolean }

const seedHistory: MockNotification[] = [
  { id: 'history-1', title: 'Welcome back', message: 'Your lobby display is online and ready.', variant: 'success', durationMs: 4500, createdAt: '2026-10-10T09:42:00.000Z', eventKey: 'welcome', read: true },
  { id: 'history-2', title: 'Schedule switched', message: 'Evening Lobby is now showing on the frame.', variant: 'info', durationMs: 6000, createdAt: '2026-10-10T08:15:00.000Z', eventKey: 'schedule-switch', read: true },
  { id: 'history-3', title: 'Reminder', message: 'The breakfast menu starts in 30 minutes.', variant: 'reminder', durationMs: 15000, createdAt: '2026-10-09T23:30:00.000Z', eventKey: 'breakfast', read: false },
  { id: 'history-4', title: 'Weather data delayed', message: 'The last successful update was 18 minutes ago.', variant: 'warning', durationMs: 9000, createdAt: '2026-10-09T21:18:00.000Z', eventKey: 'weather-delay', read: false },
]

const variantMeta = {
  info: { label: 'Information', icon: Info, className: 'text-sky-500 bg-sky-500/10 border-sky-500/20' },
  success: { label: 'Success', icon: CheckCircle2, className: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  warning: { label: 'Warning', icon: TriangleAlert, className: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  error: { label: 'Alert', icon: CircleAlert, className: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  reminder: { label: 'Reminder', icon: Clock3, className: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
} as const

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export function NotificationsPanel({ notifications }: NotificationPanelProps) {
  const [enabled, setEnabled] = useState(true)
  const [history, setHistory] = useState(seedHistory)
  const [activePreview, setActivePreview] = useState<MockNotification | null>(null)
  const [duration, setDuration] = useState(6000)
  const unread = history.filter((item) => !item.read).length

  const liveCount = notifications.length
  const currentPreview = activePreview ?? history[0]
  const groupedHistory = useMemo(() => history.filter((item) => item.read || item.id !== currentPreview?.id), [history, currentPreview])

  function preview(variant: MockNotification['variant']) {
    const meta = variantMeta[variant]
    const sample: MockNotification = {
      id: `preview-${Date.now()}`,
      title: meta.label === 'Reminder' ? 'Preview reminder' : `Preview ${meta.label.toLowerCase()}`,
      message: 'This is how a context-driven notice will appear on your display.',
      variant,
      durationMs: duration,
      createdAt: new Date().toISOString(),
      read: false,
    }
    setActivePreview(sample)
    setHistory((items) => [sample, ...items].slice(0, 12))
    toast.success('Preview sent to the frame', { description: `${meta.label} · ${duration / 1000}s` })
  }

  function clearHistory() {
    setHistory([])
    setActivePreview(null)
    toast.success('Notification history cleared')
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Frame behavior</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Notifications</h2>
          <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">Control the notices your displays surface and see exactly how they will look.</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell aria-hidden /></div>
      </div>

      <section className="rounded-2xl border border-border bg-secondary/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><div className={cn('size-2 rounded-full', enabled ? 'bg-emerald-500' : 'bg-muted-foreground')} /><div><p className="text-sm font-medium text-foreground">Display notifications</p><p className="text-[11px] text-muted-foreground">{enabled ? 'Active on connected frames' : 'Paused everywhere'}</p></div></div>
          <button type="button" role="switch" aria-checked={enabled} aria-label="Display notifications" onClick={() => setEnabled((value) => !value)} className={cn('relative h-6 w-11 rounded-full transition-colors', enabled ? 'bg-primary' : 'bg-muted')}><span className={cn('absolute top-1 size-4 rounded-full bg-background shadow-sm transition-transform', enabled ? 'left-6' : 'left-1')} /></button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-foreground">Live preview</p><p className="text-[11px] text-muted-foreground">Send a safe mock notice to the frame</p></div><Sparkles className="text-primary" aria-hidden /></div>
        <div className="rounded-2xl border border-border bg-foreground/[0.03] p-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-slate-950 p-3 shadow-inner">
            <div className="mb-7 flex items-center justify-between text-[9px] text-white/45"><span>LOBBY DISPLAY</span><span>10:09</span></div>
            <div className="mx-auto flex min-h-24 max-w-[15rem] items-start gap-2 rounded-xl border border-white/10 bg-white/[0.09] p-3 text-white shadow-2xl backdrop-blur"><div className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg', variantMeta[currentPreview.variant].className)}>{(() => { const Icon = variantMeta[currentPreview.variant].icon; return <Icon aria-hidden /> })()}</div><div className="min-w-0"><p className="text-[11px] font-semibold">{currentPreview.title}</p><p className="mt-1 text-[10px] leading-relaxed text-white/60">{currentPreview.message}</p></div><button type="button" aria-label="Dismiss preview" onClick={() => setActivePreview(null)} className="text-white/40 hover:text-white"><X aria-hidden /></button></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => preview('info')} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-[11px] font-medium text-foreground hover:bg-secondary"><Play aria-hidden />Test info</button><button type="button" onClick={() => preview('warning')} className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-2 text-[11px] font-medium text-foreground hover:bg-secondary"><TriangleAlert aria-hidden />Test warning</button></div>
        </div>
      </section>

      <section className="flex flex-col gap-3"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-foreground">Timing</p><p className="text-[11px] text-muted-foreground">How long routine notices remain visible</p></div><span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">{duration / 1000}s</span></div><input aria-label="Notification duration" type="range" min="2500" max="15000" step="500" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="w-full accent-primary" /><div className="flex justify-between text-[10px] text-muted-foreground"><span>2.5s</span><span>15s</span></div></section>

      <section className="flex flex-col gap-3"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-foreground">Recent history</p><p className="text-[11px] text-muted-foreground">{unread} unread · {liveCount} active from the frame</p></div><button type="button" onClick={clearHistory} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Trash2 aria-hidden />Clear</button></div><div className="flex flex-col divide-y divide-border rounded-2xl border border-border">{groupedHistory.length ? groupedHistory.map((item) => { const meta = variantMeta[item.variant]; const Icon = meta.icon; return <button type="button" key={item.id} onClick={() => setActivePreview(item)} className="flex items-start gap-2.5 p-3 text-left hover:bg-secondary/50"><div className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border', meta.className)}><Icon aria-hidden /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-foreground">{item.title}</p><span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(item.createdAt)}</span></div><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.message}</p></div><ChevronRight className="mt-1 shrink-0 text-muted-foreground" aria-hidden /></button> }) : <div className="p-5 text-center text-xs text-muted-foreground">No notifications in history.</div>}</div></section>

      <section className="rounded-2xl border border-dashed border-border p-3"><div className="flex items-start gap-2.5"><Settings2 className="mt-0.5 text-muted-foreground" aria-hidden /><div><p className="text-xs font-semibold text-foreground">Quiet hours and priority</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Critical alerts can bypass quiet hours. Informational notices will be held until your schedule resumes.</p><button type="button" onClick={() => toast('Advanced controls coming next', { description: 'Quiet hours and priority rules are ready to configure.' })} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">Configure rules <ChevronRight aria-hidden /></button></div></div></section>
    </div>
  )
}
