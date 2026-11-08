'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { GradientDef, ImageFillDef, WidgetStyle } from '@/lib/types'
import { CURATED_FILLS } from '@/lib/curated-fills'
import { STYLE_THEMES } from '@/lib/widgets'

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="editor-panel-section">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
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
    <div className="flex flex-col gap-2">
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
        <label htmlFor={id} className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2 font-mono text-xs uppercase text-muted-foreground">
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
        className="editor-control h-8 px-2 font-mono text-xs"
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
      className="flex items-center justify-between gap-2 text-left text-sm text-foreground"
    >
      {label}
      <span className={cn('relative h-4 w-7 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-secondary')}>
        <span className={cn('absolute top-0.5 size-3 rounded-full bg-foreground shadow transition-transform', checked ? 'translate-x-3.5' : 'translate-x-0.5')} />
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
        className="editor-control h-8 max-w-[60%] px-2"
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
    <div role="radiogroup" aria-label={label} className={cn('flex h-8 rounded-md bg-secondary p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
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
    <div className="editor-control flex h-8 items-center gap-2 px-2">
      <label htmlFor={id} className="font-mono text-sm text-muted-foreground">
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
        'editor-icon-button',
        active && 'bg-primary/10 text-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}

// --- Text-effects primitives (Task 4) ---

export function AngleDial({
  label = 'Angle',
  value,
  onChange,
  onCommit,
}: {
  label?: string
  value: number
  onChange: (value: number) => void
  onCommit?: () => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const id = useId()
  const normalized = ((Math.round(value) % 360) + 360) % 360
  const rad = (normalized * Math.PI) / 180
  const cx = 32
  const cy = 32
  const r = 26
  const needleX = cx + Math.cos(rad) * r
  const needleY = cy + Math.sin(rad) * r

  const fromPointer = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
    onChange(Math.round(deg))
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span id={id} className="text-sm text-foreground">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{normalized}°</span>
        <svg
          ref={ref}
          viewBox="0 0 64 64"
          className="size-16 cursor-pointer touch-none rounded-full bg-secondary"
          role="slider"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={normalized}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              onCommit?.()
              onChange((normalized + 1) % 360)
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              onCommit?.()
              onChange((normalized + 359) % 360)
            }
          }}
          onPointerDown={(e) => {
            onCommit?.()
            fromPointer(e.clientX, e.clientY)
            const move = (ev: PointerEvent) => fromPointer(ev.clientX, ev.clientY)
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        >
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="2" className="stroke-border" />
          <line x1={cx} y1={cy} x2={needleX} y2={needleY} strokeWidth="2" className="stroke-primary" />
          <circle cx={needleX} cy={needleY} r="4" className="fill-primary" />
          <circle cx={cx} cy={cy} r="3" className="fill-foreground" />
        </svg>
      </div>
    </div>
  )
}

export function GradientStopPicker({
  stops,
  onChange,
  onCommit,
}: {
  stops: GradientDef['stops']
  onChange: (stops: GradientDef['stops']) => void
  onCommit?: () => void
}) {
  const update = (index: number, patch: Partial<GradientDef['stops'][number]>) =>
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-foreground">Gradient stops</span>
      {stops.map((stop, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="color"
            value={stop.color}
            aria-label={`Stop ${i + 1} color`}
            onFocus={onCommit}
            onChange={(e) => update(i, { color: e.target.value })}
            className="editor-control h-8 w-10 shrink-0 cursor-pointer p-1"
          />
          <div className="min-w-0 flex-1">
            <SliderField
              label={`Stop ${i + 1} position`}
              value={stop.position}
              min={0}
              max={100}
              suffix="%"
              onCommit={onCommit}
              onChange={(v) => update(i, { position: v })}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove stop ${i + 1}`}
            disabled={stops.length <= 2}
            onClick={() => {
              onCommit?.()
              onChange(stops.filter((_, j) => j !== i))
            }}
            className="flex h-8 shrink-0 items-center rounded-md bg-secondary px-2 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:pointer-events-none disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ))}
      {stops.length < 2 && <p className="text-xs text-muted-foreground">A gradient needs at least 2 stops.</p>}
      <button
        type="button"
        disabled={stops.length >= 8}
        onClick={() => {
          onCommit?.()
          onChange([...stops, { color: '#ffffff', position: Math.min(100, Math.round(100 / (stops.length + 1))) }])
        }}
        className="h-8 rounded-md bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:pointer-events-none disabled:opacity-40"
      >
        Add stop
      </button>
    </div>
  )
}

export type ImageFillTab = 'curated' | 'url' | 'upload'

export function ImageFillField({
  image,
  onChange,
  onCommit,
}: {
  image: ImageFillDef
  onChange: (image: ImageFillDef) => void
  onCommit?: () => void
}) {
  const [tab, setTab] = useState<ImageFillTab>('curated')
  const [urlDraft, setUrlDraft] = useState(image.url)
  // This field is reused across widgets: resync the draft whenever the
  // target image URL changes so Apply never writes a stale URL.
  useEffect(() => {
    setUrlDraft(image.url)
  }, [image.url])
  const [urlError, setUrlError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const applyUrl = () => {
    const trimmed = urlDraft.trim()
    if (!trimmed) {
      setUrlError('Enter an image URL.')
      return
    }
    if (!/^(https?:\/\/|\/)/.test(trimmed)) {
      setUrlError('URL must start with http://, https:// or /.')
      return
    }
    setUrlError(null)
    onCommit?.()
    onChange({ ...image, url: trimmed })
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const data = (await res.json()) as { url?: string }
      if (!data.url) throw new Error('Upload returned no URL')
      onCommit?.()
      onChange({ ...image, url: data.url })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented<ImageFillTab>
        label="Image fill source"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'curated', label: 'Curated' },
          { value: 'url', label: 'URL' },
          { value: 'upload', label: 'Upload' },
        ]}
      />
      {tab === 'curated' && (
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Curated fills">
          {CURATED_FILLS.map((fill) => {
            const active = image.url === fill.url
            return (
              <button
                key={fill.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={fill.label}
                aria-label={fill.label}
                onClick={() => {
                  onCommit?.()
                  onChange({ url: fill.url, fit: 'cover', scale: 100, position: 50 })
                }}
                className={cn(
                  'overflow-hidden rounded-lg ring-1 transition',
                  active ? 'ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fill.url} alt={fill.label} className="aspect-square w-full object-cover" loading="lazy" />
              </button>
            )
          })}
        </div>
      )}
      {tab === 'url' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://… or /api/uploads/…"
              className="editor-control h-8 min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={applyUrl}
              className="flex h-8 shrink-0 items-center rounded-md bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
            >
              Apply
            </button>
          </div>
          {urlError && (
            <p role="alert" className="text-xs text-destructive">
              {urlError}
            </p>
          )}
        </div>
      )}
      {tab === 'upload' && (
        <div className="flex flex-col gap-1.5">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => upload(e.target.files?.[0])}
            className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
          {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
          {uploadError && (
            <p role="alert" className="text-xs text-destructive">
              {uploadError}
            </p>
          )}
        </div>
      )}
      <Segmented<'cover' | 'contain' | 'repeat'>
        label="Image fit"
        value={image.fit}
        onChange={(fit) => {
          onCommit?.()
          onChange({ ...image, fit })
        }}
        options={[
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'repeat', label: 'Repeat' },
        ]}
      />
      <SliderField label="Scale" value={image.scale} min={50} max={200} suffix="%" onCommit={onCommit} onChange={(scale) => onChange({ ...image, scale })} />
      <SliderField label="Position" value={image.position} min={0} max={100} suffix="%" onCommit={onCommit} onChange={(position) => onChange({ ...image, position })} />
    </div>
  )
}
