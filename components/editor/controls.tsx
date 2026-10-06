'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { WidgetStyle } from '@/lib/types'
import { STYLE_THEMES } from '@/lib/widgets'

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
  onCommit?: () => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm text-foreground">
          {label}
        </label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onKeyDown={(e) => {
          if (e.key.startsWith('Arrow')) onCommit?.()
        }}
        onChange={(e) => onChange(Number(e.target.value))}
        className="frame-range w-full"
      />
    </div>
  )
}

const SWATCHES = ['#ffffff', '#0b0c10', '#7cc4ff', '#ffd36e', '#ffb86b', '#ff8fa3', '#9be7c4', '#c7b8ff']

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground">{label}</span>
        <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-2 py-1 font-mono text-xs uppercase text-muted-foreground">
          <span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: value }} />
          {value}
          <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" aria-label={`${label} custom color`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${label} swatches`}>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === swatch}
            aria-label={swatch}
            onClick={() => onChange(swatch)}
            className={cn(
              'size-6 rounded-full ring-1 ring-border transition-transform hover:scale-110',
              value.toLowerCase() === swatch && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
            )}
            style={{ background: swatch }}
          />
        ))}
      </div>
    </div>
  )
}

export function ThemeSwatches({ onApply, label = 'Quick themes' }: { onApply: (style: Partial<WidgetStyle>) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-foreground">{label}</span>
      <div className="grid grid-cols-5 gap-1.5">
        {STYLE_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => onApply(theme.style)}
            title={`Apply ${theme.name} theme`}
            className="flex flex-col items-center gap-1 rounded-lg p-1.5 ring-1 ring-border transition hover:ring-primary"
          >
            <span className="relative flex size-7 items-center justify-center rounded-full" style={{ background: theme.style.bg }}>
              <span className="size-3.5 rounded-full" style={{ background: theme.style.accent }} />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-1 ring-card" style={{ background: theme.style.color }} />
            </span>
            <span className="text-[10px] text-muted-foreground">{theme.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-8 rounded-md border border-border bg-secondary px-2 font-mono text-xs text-foreground outline-none [color-scheme:dark] focus-visible:border-primary"
      />
    </div>
  )
}

export function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 text-left text-sm text-foreground"
    >
      {label}
      <span className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-secondary')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-foreground shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[60%] rounded-md border border-border bg-secondary px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-lg bg-secondary p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2 rounded-md bg-secondary px-2">
      <label htmlFor={id} className="font-mono text-xs text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="h-8 w-full min-w-0 bg-transparent text-right font-mono text-sm tabular-nums text-foreground outline-none"
      />
    </div>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
  className,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  active?: boolean
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
        active && 'bg-secondary text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}
