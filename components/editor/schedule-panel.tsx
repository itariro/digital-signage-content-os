'use client'

import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { CalendarClock, ExternalLink, MoonStar, Plus, Trash2 } from 'lucide-react'
import type { FrameSchedule, Layout, ScheduleRule } from '@/lib/types'
import { DAY_LABELS, clockParts, describeDays, resolveDisplay } from '@/lib/schedule'
import { Section, SliderField, TimeField, ToggleField } from './controls'
import { FRAME_WIDTH } from '@/lib/types'
import { FrameScene } from '@/components/frame/frame-scene'
import { useLiveData } from './widget-preview'
import { cn } from '@/lib/utils'

type SchedulePanelProps = {
  schedule: FrameSchedule
  layouts: Layout[]
  activeId: string | null
  now: Date | null
  onSave: (schedule: FrameSchedule) => Promise<void>
}

export function SchedulePanel({ schedule, layouts, activeId, now, onSave }: SchedulePanelProps) {
  const { weather } = useLiveData()
  const [draft, setDraft] = useState(schedule)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function update(next: FrameSchedule, debounce = false) {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    if (debounce) timer.current = setTimeout(() => onSave(next), 400)
    else onSave(next)
  }

  const updateRule = (id: string, patch: Partial<ScheduleRule>) =>
    update({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const resolved = now ? resolveDisplay({ activeId, layouts, schedule: draft }, clockParts(now)) : null
  const showing = resolved?.layout

  function addRule() {
    const used = new Set(draft.rules.map((r) => r.layoutId))
    const layout = layouts.find((l) => !used.has(l.id)) ?? layouts[0]
    if (!layout) return
    update({
      ...draft,
      enabled: true,
      rules: [...draft.rules, { id: nanoid(8), layoutId: layout.id, days: [1, 2, 3, 4, 5], start: '07:00', end: '09:00' }],
    })
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">On the frame right now</p>
        {showing ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0 overflow-hidden rounded-md ring-1 ring-border">
              <FrameScene
                widgets={showing.widgets}
                settings={showing.settings}
                weather={weather}
                now={now}
                scale={60 / FRAME_WIDTH}
                night={resolved?.night ? draft.night : null}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-semibold text-foreground">{showing.name}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {resolved?.rule ? `Scheduled ${resolved.rule.start}–${resolved.rule.end}` : 'Default layout'}
                {resolved?.night ? ' · night mode on' : ''}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No layout available</span>
        )}
        <a
          href="/frame"
          target="_blank"
          rel="noreferrer"
          className="flex h-9 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          <ExternalLink className="size-4" aria-hidden />
          Open frame display
        </a>
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          Point the frame&apos;s kiosk browser at <code className="rounded bg-secondary px-1 font-mono text-foreground">/frame</code>. It
          follows this schedule and picks up saved edits within 30 seconds.
        </p>
      </div>

      <Section
        title="Layout schedule"
        action={
          <button type="button" onClick={addRule} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="size-3.5" aria-hidden />
            Add slot
          </button>
        }
      >
        <ToggleField label="Switch layouts by time" checked={draft.enabled} onChange={(enabled) => update({ ...draft, enabled })} />
        {draft.rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 text-center">
            <CalendarClock className="size-5 text-muted-foreground" aria-hidden />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Add a slot to show a different layout at certain times, for example a planner on weekday mornings.
            </p>
          </div>
        ) : (
          <ol className={cn('flex flex-col gap-2', !draft.enabled && 'opacity-50')}>
            {draft.rules.map((rule, index) => (
              <li key={rule.id} className={cn('flex flex-col gap-3 rounded-xl bg-secondary p-3 ring-1', resolved?.rule?.id === rule.id ? 'ring-primary' : 'ring-border')}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">#{index + 1}</span>
                  <label className="sr-only" htmlFor={`rule-${rule.id}`}>
                    Layout for slot {index + 1}
                  </label>
                  <select
                    id={`rule-${rule.id}`}
                    value={rule.layoutId}
                    onChange={(e) => updateRule(rule.id, { layoutId: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                  >
                    {layouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove slot ${index + 1}`}
                    onClick={() => update({ ...draft, rules: draft.rules.filter((r) => r.id !== rule.id) })}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Days for slot ${index + 1}`}>
                  {DAY_LABELS.map((label, day) => {
                    const on = rule.days.includes(day)
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        aria-label={label}
                        onClick={() => updateRule(rule.id, { days: on ? rule.days.filter((d) => d !== day) : [...rule.days, day] })}
                        className={cn(
                          'h-7 rounded-md text-[11px] font-medium transition-colors',
                          on ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label[0]}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <TimeInput label="From" value={rule.start} onChange={(start) => updateRule(rule.id, { start })} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <TimeInput label="Until" value={rule.end} onChange={(end) => updateRule(rule.id, { end })} />
                </div>
                <span className="text-xs text-muted-foreground">{describeDays(rule.days)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          The first matching slot wins. Outside every slot, the frame shows the layout marked &ldquo;On frame&rdquo;.
        </p>
      </Section>

      <Section title="Night mode">
        <div className="flex items-start gap-3 rounded-xl bg-secondary p-3">
          <MoonStar className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
            Dims and warms the whole screen overnight so the frame is easy on the eyes in a dark room.
          </p>
        </div>
        <ToggleField
          label="Enable night mode"
          checked={draft.night.enabled}
          onChange={(enabled) => update({ ...draft, night: { ...draft.night, enabled } })}
        />
        <TimeField label="Starts" value={draft.night.start} onChange={(start) => update({ ...draft, night: { ...draft.night, start } })} />
        <TimeField label="Ends" value={draft.night.end} onChange={(end) => update({ ...draft, night: { ...draft.night, end } })} />
        <SliderField
          label="Brightness"
          value={draft.night.brightness}
          min={5}
          max={100}
          suffix="%"
          onChange={(brightness) => update({ ...draft, night: { ...draft.night, brightness } }, true)}
        />
        <SliderField
          label="Warmth"
          value={draft.night.warmth}
          min={0}
          max={100}
          suffix="%"
          onChange={(warmth) => update({ ...draft, night: { ...draft.night, warmth } }, true)}
        />
        <ToggleField
          label="Hide seconds at night"
          checked={draft.night.hideSeconds}
          onChange={(hideSeconds) => update({ ...draft, night: { ...draft.night, hideSeconds } })}
        />
      </Section>
    </div>
  )
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="sr-only">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground outline-none [color-scheme:dark] focus-visible:border-primary"
      />
    </label>
  )
}
