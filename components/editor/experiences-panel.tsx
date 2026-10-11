'use client'

import { useEffect, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import type { BobExpression, ExperienceRule, Experiences } from '@/lib/types'
import { mergeDaysCondition, toggleWeekday } from '@/lib/experience-draft'
import { formatLocalInputValue } from '@/lib/zoned-time'
import { Section, ToggleField } from './controls'

type ExperiencesPanelProps = {
  experiences: Experiences
  layouts: { id: string; name: string }[]
  onSave: (experiences: Experiences) => Promise<void>
}

const WEEKDAY_OPTIONS = [
  { value: 'MON', label: 'Mon' },
  { value: 'TUE', label: 'Tue' },
  { value: 'WED', label: 'Wed' },
  { value: 'THU', label: 'Thu' },
  { value: 'FRI', label: 'Fri' },
  { value: 'SAT', label: 'Sat' },
  { value: 'SUN', label: 'Sun' },
] as const

const EXPRESSION_OPTIONS = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))

const STATE_OPTIONS = [
  { value: 'ambient', label: 'Ambient' },
  { value: 'information', label: 'Information' },
  { value: 'action', label: 'Action' },
  { value: 'celebration', label: 'Celebration' },
  { value: 'activity', label: 'Activity' },
  { value: 'gallery', label: 'Gallery' },
  { value: 'weather', label: 'Weather' },
  { value: 'family', label: 'Family' },
] as const

export function ExperiencesPanel({ experiences, layouts, onSave }: ExperiencesPanelProps) {
  const [draft, setDraft] = useState(experiences)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-sync when the server store changes (e.g. normalize pruned a rule for a
  // deleted layout) but never clobber an in-flight debounced edit.
  useEffect(() => {
    if (timer.current) return
    setDraft(experiences)
  }, [experiences])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function update(next: Experiences, debounce = false) {
    setDraft(next)
    if (timer.current) clearTimeout(timer.current)
    if (debounce) {
      timer.current = setTimeout(() => {
        timer.current = null
        onSave(next)
      }, 400)
    } else {
      onSave(next)
    }
  }

  const updateRule = (id: string, patch: Partial<ExperienceRule>, debounce = false) =>
    update({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, debounce)

  function addRule() {
    const used = new Set(draft.rules.map((r) => r.then.layoutId))
    const layout = layouts.find((l) => !used.has(l.id)) ?? layouts[0]
    if (!layout) return
    update({
      ...draft,
      enabled: true,
      rules: [
        ...draft.rules,
        {
          id: nanoid(8),
          name: 'New rule',
          enabled: true,
          priority: 100,
          when: { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
          then: { layoutId: layout.id, state: 'ambient', score: 0, durationMs: 0 },
        },
      ],
    })
  }

  function removeRule(id: string) {
    update({ ...draft, rules: draft.rules.filter((r) => r.id !== id) })
  }

  return (
    <div className="flex flex-col">
      <Section
        title="Experiences"
        action={
          <button type="button" onClick={addRule} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="size-3.5" aria-hidden />
            Add rule
          </button>
        }
      >
        <ToggleField
          label="Enable Bob engine"
          checked={draft.enabled}
          onChange={(enabled) => update({ ...draft, enabled })}
        />
        {draft.rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Add a rule to show different layouts based on time, weather, or special days.
            </p>
          </div>
        ) : (
          <ol className={!draft.enabled ? 'flex flex-col gap-2 opacity-50' : 'flex flex-col gap-2'}>
            {draft.rules.map((rule, index) => (
              <li key={rule.id} className="flex flex-col gap-3 rounded-xl bg-secondary p-3 ring-1 ring-border">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">#{index + 1}</span>
                  <label className="sr-only" htmlFor={`exp-name-${rule.id}`}>
                    Rule name
                  </label>
                  <input
                    id={`exp-name-${rule.id}`}
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, { name: e.target.value }, true)}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                      className="size-3.5"
                    />
                    On
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove rule ${index + 1}`}
                    onClick={() => removeRule(rule.id)}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
                  {WEEKDAY_OPTIONS.map(({ value, label }) => {
                    const currentDays = 'days' in rule.when ? rule.when.days : []
                    const on = currentDays.includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        aria-label={label}
                        onClick={() => updateRule(rule.id, { when: mergeDaysCondition(rule.when, toggleWeekday(currentDays, value, !on)) })}
                        className={
                          on
                            ? 'h-7 rounded-md bg-primary text-[11px] font-medium text-primary-foreground'
                            : 'h-7 rounded-md bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground'
                        }
                      >
                        {label[0]}
                      </button>
                    )
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Layout</span>
                    <select
                      value={rule.then.layoutId}
                      onChange={(e) => updateRule(rule.id, { then: { ...rule.then, layoutId: e.target.value } })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      {layouts.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">State</span>
                    <select
                      value={rule.then.state}
                      onChange={(e) => updateRule(rule.id, { then: { ...rule.then, state: e.target.value as ExperienceRule['then']['state'] } })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      {STATE_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bob expression</span>
                    <select
                      value={rule.then.bob?.expression ?? ''}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          then: {
                            ...rule.then,
                            bob: e.target.value
                              ? { ...rule.then.bob, expression: e.target.value as BobExpression }
                              : undefined,
                          },
                        })
                      }
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      <option value="">No Bob</option>
                      {EXPRESSION_OPTIONS.map(({ value, label }) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Bob speech</span>
                    <input
                      type="text"
                      maxLength={500}
                      value={rule.then.bob?.speech ?? ''}
                      placeholder="What Bob says on the frame"
                      onChange={(e) => {
                        const speech = e.target.value
                        const bob = speech || rule.then.bob?.expression
                          ? { expression: rule.then.bob?.expression ?? ('talking' as BobExpression), speech: speech || undefined }
                          : undefined
                        updateRule(rule.id, { then: { ...rule.then, bob } }, true)
                      }}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Priority</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={rule.priority}
                      onChange={(e) => updateRule(rule.id, { priority: parseInt(e.target.value) || 0 })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Score</span>
                    <input
                      type="number"
                      value={rule.then.score}
                      onChange={(e) => updateRule(rule.id, { then: { ...rule.then, score: parseInt(e.target.value) || 0 } })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Duration (ms)</span>
                    <input
                      type="number"
                      min={0}
                      value={rule.then.durationMs}
                      onChange={(e) => updateRule(rule.id, { then: { ...rule.then, durationMs: parseInt(e.target.value) || 0 } })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
          Rules are evaluated by priority and score. The highest-scoring matching rule wins.
        </p>
      </Section>

      <Section title="Settings">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">School holidays (comma-separated dates)</span>
          <input
            type="text"
            value={draft.settings.schoolHolidays.join(', ')}
            onChange={(e) =>
              update(
                {
                  ...draft,
                  settings: {
                    ...draft.settings,
                    schoolHolidays: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  },
                },
                true,
              )
            }
            placeholder="2026-12-25, 2026-12-26"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Timezone</span>
          <input
            type="text"
            value={draft.settings.timezone ?? ''}
            onChange={(e) => update({ ...draft, settings: { ...draft.settings, timezone: e.target.value || undefined } }, true)}
            placeholder="Europe/Zurich"
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          />
        </label>
      </Section>

      <Section title="Preview">
        <PreviewSection />
      </Section>
    </div>
  )
}

function PreviewSection({ frameId = 'home' }: { frameId?: string }) {
  const [dateTime, setDateTime] = useState(() => formatLocalInputValue(new Date()))
  const [preview, setPreview] = useState<{ decision?: { layoutId?: string; bob?: { expression?: string } | null; reason?: string }; context?: { period?: string }; warning?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runPreview() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/display/preview?frame=${encodeURIComponent(frameId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateTime }),
      })
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string }
        throw new Error(errData.error ?? `Preview failed (${res.status})`)
      }
      setPreview(await res.json())
    } catch (error) {
      console.error('Preview failed:', error)
      setPreview(null)
      setError(error instanceof Error ? error.message : 'Preview failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Simulated time (frame local)</span>
        <input
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
        />
      </label>
      <button
        type="button"
        onClick={runPreview}
        disabled={loading || !dateTime}
        className="flex h-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Loading...' : 'Preview decision'}
      </button>
      {error && <p className="text-pretty text-xs text-destructive">{error}</p>}
      {preview && (
        <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Layout:</span>
            <span className="font-mono text-foreground">{preview.decision?.layoutId ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bob:</span>
            <span className="font-mono text-foreground">{preview.decision?.bob?.expression ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reason:</span>
            <span className="font-mono text-foreground">{preview.decision?.reason ?? 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Period:</span>
            <span className="font-mono text-foreground">{preview.context?.period ?? 'none'}</span>
          </div>
          {preview.warning && <p className="text-pretty text-amber-600">{preview.warning}</p>}
        </div>
      )}
    </div>
  )
}
