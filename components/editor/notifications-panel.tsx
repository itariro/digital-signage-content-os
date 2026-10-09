'use client'

import { useMemo, useState } from 'react'
import { Bell, BellRing, Check, Clock3, Eye, Info, Megaphone, Play, RotateCcw, Settings2, ShieldAlert, Trash2, Volume2, X } from 'lucide-react'
import type { FrameNotification } from '@/lib/types'
import { NOTIFICATION_DEFAULT_DURATION, notificationTone } from '@/lib/notifications'
import { cn } from '@/lib/utils'

const MOCK_NOTIFICATIONS: FrameNotification[] = [
  { id: 'mock-maintenance', title: 'Scheduled maintenance', message: 'The display will restart at 02:00 tonight.', variant: 'reminder', durationMs: 15000, createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(), eventKey: 'maintenance-02' },
  { id: 'mock-sync', title: 'Content synced', message: 'Your latest layout is now showing on the frame.', variant: 'success', durationMs: 4500, createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(), eventKey: 'sync-123' },
  { id: 'mock-offline', title: 'Connection interrupted', message: 'The frame is using its last known content.', variant: 'warning', durationMs: 9000, createdAt: new Date(Date.now() - 1000 * 60 * 36).toISOString(), eventKey: 'offline-1' },
]

const VARIANT_META: Record<FrameNotification['variant'], { label: string; icon: typeof Info }> = {
  info: { label: 'Informational', icon: Info },
  success: { label: 'Success', icon: Check },
  warning: { label: 'Warning', icon: ShieldAlert },
  error: { label: 'Critical alert', icon: ShieldAlert },
  reminder: { label: 'Reminder', icon: BellRing },
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}>
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}

export function NotificationsPanel() {
  const [history, setHistory] = useState(MOCK_NOTIFICATIONS)
  const [enabled, setEnabled] = useState(true)
  const [sound, setSound] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | FrameNotification['variant']>('all')
  const [testNotification, setTestNotification] = useState<FrameNotification | null>(null)

  const filteredHistory = useMemo(() => activeFilter === 'all' ? history : history.filter((item) => item.variant === activeFilter), [activeFilter, history])

  function sendTest(variant: FrameNotification['variant']) {
    const item: FrameNotification = {
      id: `test-${Date.now()}`,
      title: variant === 'error' ? 'Frame needs attention' : `Test ${VARIANT_META[variant].label.toLowerCase()}`,
      message: 'This is a preview notification. It will not be sent to a live frame.',
      variant,
      durationMs: NOTIFICATION_DEFAULT_DURATION[variant],
      createdAt: new Date().toISOString(),
    }
    setTestNotification(item)
    setHistory((current) => [item, ...current].slice(0, 20))
  }

  return (
    <section className="flex flex-col gap-4 p-3" aria-label="Notification manager">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Notifications</h2>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Control what appears on your frame and test the experience before publishing.</p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label="Enable frame notifications" />
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1" role="tablist" aria-label="Notification history filter">
        {(['all', 'warning', 'reminder'] as const).map((filter) => (
          <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={cn('rounded-md px-2 py-1.5 text-[10px] font-medium capitalize', activeFilter === filter ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {filter === 'all' ? 'All history' : filter}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold">Recent activity</h3>
          <p className="text-[10px] text-muted-foreground">Last 20 events on this frame</p>
        </div>
        <button type="button" onClick={() => setHistory([])} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" disabled={!history.length}><Trash2 className="size-3" aria-hidden /> Clear</button>
      </div>

      <div className="flex flex-col gap-2">
        {filteredHistory.length ? filteredHistory.map((item) => {
          const Icon = VARIANT_META[item.variant].icon
          return <article key={item.id} className="rounded-lg border border-border bg-background/60 p-2.5">
            <div className="flex items-start gap-2">
              <div className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border', notificationTone(item.variant))}><Icon className="size-3.5" aria-hidden /></div>
              <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h4 className="truncate text-[11px] font-medium">{item.title}</h4><span className="shrink-0 text-[9px] text-muted-foreground">{item.variant}</span></div><p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.message}</p><p className="mt-1 text-[9px] text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · auto-dismisses</p></div>
            </div>
          </article>
        }) : <p className="rounded-lg border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">No notifications in this view.</p>}
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2"><Play className="size-3.5 text-primary" aria-hidden /><h3 className="text-xs font-semibold">Preview lab</h3></div>
        <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">Trigger sample events to see how unattended notices look on the frame.</p>
        <div className="grid grid-cols-2 gap-2">
          {(['info', 'success', 'warning', 'error'] as const).map((variant) => <button key={variant} type="button" onClick={() => sendTest(variant)} className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-left text-[10px] capitalize hover:bg-muted"><span className={cn('size-2 rounded-full', variant === 'error' ? 'bg-destructive' : variant === 'warning' ? 'bg-accent' : variant === 'success' ? 'bg-primary' : 'bg-muted-foreground')} /> Test {variant}</button>)}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="mb-3 flex items-center gap-2"><Settings2 className="size-3.5 text-primary" aria-hidden /><h3 className="text-xs font-semibold">Display settings</h3></div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Eye className="size-3.5 text-muted-foreground" aria-hidden /><span className="text-[11px]">Show live preview</span></div><Toggle checked={showPreview} onChange={setShowPreview} label="Show live preview" /></div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Volume2 className="size-3.5 text-muted-foreground" aria-hidden /><span className="text-[11px]">Sound cues</span></div><Toggle checked={sound} onChange={setSound} label="Sound cues" /></div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 className="size-3.5 text-muted-foreground" aria-hidden /><span className="text-[11px]">Default duration</span></div><span className="text-[10px] text-muted-foreground">6 seconds</span></div>
        </div>
      </div>

      {showPreview && testNotification && <div className="border-t border-border pt-4"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-medium text-muted-foreground">Live preview</span><button type="button" onClick={() => setTestNotification(null)} aria-label="Close preview" className="text-muted-foreground hover:text-foreground"><X className="size-3" /></button></div><div className={cn('rounded-xl border p-3', notificationTone(testNotification.variant))}><div className="flex items-start gap-2"><Megaphone className="mt-0.5 size-4" aria-hidden /><div><p className="text-xs font-semibold">{testNotification.title}</p><p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{testNotification.message}</p></div></div></div></div>}
      <button type="button" onClick={() => { setHistory(MOCK_NOTIFICATIONS); setTestNotification(null); setActiveFilter('all') }} className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-2 py-2 text-[10px] text-muted-foreground hover:bg-muted"><RotateCcw className="size-3" aria-hidden /> Reset demo data</button>
    </section>
  )
}
