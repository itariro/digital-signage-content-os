'use client'

import { useMemo, useState } from 'react'
import { Bell, BellRing, Check, Clock3, Eye, Info, Megaphone, Play, RotateCcw, Settings2, ShieldAlert, Trash2, Volume2, X } from 'lucide-react'
import type { FrameNotification } from '@/lib/types'
import { NOTIFICATION_DEFAULT_DURATION, createDemoNotifications, formatNotificationTime, notificationTone } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/notifications/notification-provider'
import { EditorButton, Section } from './controls'

const VARIANT_META: Record<FrameNotification['variant'], { label: string; icon: typeof Info }> = {
  info: { label: 'Informational', icon: Info },
  success: { label: 'Success', icon: Check },
  warning: { label: 'Warning', icon: ShieldAlert },
  error: { label: 'Critical alert', icon: ShieldAlert },
  reminder: { label: 'Reminder', icon: BellRing },
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', checked ? 'justify-end bg-primary' : 'justify-start bg-muted')}>
      <span className="size-4 rounded-full bg-background shadow-sm" />
    </button>
  )
}

export function NotificationsPanel() {
  const [history, setHistory] = useState(createDemoNotifications)
  const [enabled, setEnabled] = useState(true)
  const [sound, setSound] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all' | FrameNotification['variant']>('all')
  const [testNotification, setTestNotification] = useState<FrameNotification | null>(null)
  const [liveStatus, setLiveStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const { publish } = useNotifications()

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
    if (enabled) publish(item)
    setLiveStatus('idle')
  }

  async function sendToLiveFrame() {
    if (!testNotification) return
    setLiveStatus('sending')
    try {
      const response = await fetch('/api/frames/home/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testNotification) })
      if (!response.ok) throw new Error('Live frame request failed')
      setLiveStatus('sent')
    } catch {
      setLiveStatus('error')
    }
  }

  return (
    <section className="editor-panel flex flex-col" aria-label="Notification manager">
      <Section title="Notifications" action={<Toggle checked={enabled} onChange={setEnabled} label="Enable frame notifications" />}>
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">Control what appears on your frame and test the experience before publishing.</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1" role="tablist" aria-label="Notification history filter">
          {(['all', 'warning', 'reminder'] as const).map((filter) => (
            <EditorButton
              key={filter}
              type="button"
              role="tab"
              aria-selected={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
              variant={activeFilter === filter ? 'secondary' : 'quiet'}
              className="min-h-8 px-2 text-xs capitalize"
            >
              {filter === 'all' ? 'All history' : filter}
            </EditorButton>
          ))}
        </div>
      </Section>

      <Section
        title="Recent activity"
        action={
          <EditorButton type="button" variant="destructive" onClick={() => setHistory([])} disabled={!history.length} className="min-h-8 px-2.5 text-xs">
            <Trash2 className="size-4" aria-hidden />
            Clear
          </EditorButton>
        }
      >
        <p className="text-xs text-muted-foreground">Last 20 events on this frame</p>
        <div className="flex flex-col gap-2">
          {filteredHistory.length ? filteredHistory.map((item) => {
            const Icon = VARIANT_META[item.variant].icon
            return (
              <article key={item.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-2">
                  <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border', notificationTone(item.variant))}>
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-xs font-medium text-foreground">{item.title}</h4>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{item.variant}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.message}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatNotificationTime(item.createdAt)} · auto-dismisses</p>
                  </div>
                </div>
              </article>
            )
          }) : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No notifications in this view.</p>}
        </div>
      </Section>

      <Section title="Preview lab">
        <div className="flex items-start gap-2">
          <Play className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground">Trigger sample events to see how unattended notices look on the frame.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['info', 'success', 'warning', 'error'] as const).map((variant) => (
            <EditorButton key={variant} type="button" variant="secondary" onClick={() => sendTest(variant)} className="justify-start px-2 text-xs capitalize">
              <span className={cn('size-2 rounded-full', variant === 'error' ? 'bg-destructive' : variant === 'warning' ? 'bg-accent' : variant === 'success' ? 'bg-primary' : 'bg-muted-foreground')} />
              Test {variant}
            </EditorButton>
          ))}
        </div>
      </Section>

      <Section title="Live frame">
        <EditorButton
          type="button"
          variant="primary"
          onClick={sendToLiveFrame}
          disabled={!testNotification || liveStatus === 'sending'}
          aria-live="polite"
          className="w-full"
        >
          {liveStatus === 'sending' ? 'Sending…' : liveStatus === 'sent' ? 'Sent to Home frame' : liveStatus === 'error' ? 'Retry live send' : 'Send to live Home frame'}
        </EditorButton>
        {!testNotification && <p className="text-center text-xs text-muted-foreground">Run a test notification first.</p>}
        {liveStatus === 'sent' && <p role="status" className="text-center text-xs text-primary">Notification sent to the Home frame.</p>}
        {liveStatus === 'error' && <p role="alert" className="text-center text-xs text-destructive">Could not reach the live frame.</p>}
      </Section>

      <Section title="Display settings">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Eye className="size-4 text-muted-foreground" aria-hidden /><span className="text-sm text-foreground">Show live preview</span></div><Toggle checked={showPreview} onChange={setShowPreview} label="Show live preview" /></div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Volume2 className="size-4 text-muted-foreground" aria-hidden /><span className="text-sm text-foreground">Sound cues</span></div><Toggle checked={sound} onChange={setSound} label="Sound cues" /></div>
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" aria-hidden /><span className="text-sm text-foreground">Default duration</span></div><span className="text-xs text-muted-foreground">6 seconds</span></div>
        </div>
      </Section>

      <Section
        title="Demo data"
        action={
          <EditorButton
            type="button"
            variant="quiet"
            onClick={() => { setHistory(createDemoNotifications()); setTestNotification(null); setActiveFilter('all') }}
            className="min-h-8 px-2.5 text-xs"
          >
            <RotateCcw className="size-4" aria-hidden />
            Reset
          </EditorButton>
        }
      >
        <p className="text-xs text-muted-foreground">Restore the sample notification history.</p>
      </Section>
    </section>
  )
}
