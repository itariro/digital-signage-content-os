'use client'

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { GradientDef, ImageFillDef, WidgetStyle } from '@/lib/types'
import { CURATED_FILLS } from '@/lib/curated-fills'
import { STYLE_THEMES } from '@/lib/widgets'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function Section({
  title,
  children,
  action,
  className,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('editor-panel-section gap-3', className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
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
  return (
    <Field className="gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldTitle>{label}</FieldTitle>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onPointerDown={onCommit}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow')) onCommit?.()
        }}
        onValueChange={(next) => onChange(next as number)}
      />
    </Field>
  )
}

const SWATCHES = ['#ffffff', '#0b0c10', '#7cc4ff', '#ffd36e', '#ffb86b', '#ff8fa3', '#9be7c4', '#c7b8ff']

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <Field className="gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldTitle>{label}</FieldTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="gap-2 px-2 font-mono text-xs uppercase text-muted-foreground"
        >
          <span className="size-3.5 rounded-full ring-1 ring-border" style={{ background: value }} />
          {value}
        </Button>
        <Input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="sr-only"
          aria-label={`${label} custom color`}
          tabIndex={-1}
        />
      </div>
      <ToggleGroup
        aria-label={`${label} swatches`}
        value={[value.toLowerCase()]}
        onValueChange={(next) => next[0] && onChange(next[0])}
        spacing={6}
        className="flex-wrap"
      >
        {SWATCHES.map((swatch) => (
          <ToggleGroupItem
            key={swatch}
            value={swatch}
            aria-label={swatch}
            title={swatch}
            className="size-6 min-w-6 rounded-full p-0 ring-1 ring-border aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-card"
            style={{ background: swatch }}
          />
        ))}
      </ToggleGroup>
    </Field>
  )
}

export function ThemeSwatches({ onApply, label = 'Quick themes' }: { onApply: (style: Partial<WidgetStyle>) => void; label?: string }) {
  return (
    <Field className="gap-2">
      <FieldTitle>{label}</FieldTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {STYLE_THEMES.map((theme) => (
          <Button
            key={theme.id}
            type="button"
            variant="outline"
            onClick={() => onApply(theme.style)}
            title={`Apply ${theme.name} theme`}
            className="h-auto flex-col gap-1 px-1.5 py-1.5"
          >
            <span className="relative flex size-7 items-center justify-center rounded-full" style={{ background: theme.style.bg }}>
              <span className="size-3.5 rounded-full" style={{ background: theme.style.accent }} />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-1 ring-card" style={{ background: theme.style.color }} />
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">{theme.name}</span>
          </Button>
        ))}
      </div>
    </Field>
  )
}

export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="flex-1">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="w-auto font-mono text-xs tabular-nums"
      />
    </Field>
  )
}

export function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="flex-1 font-normal">
        {label}
      </FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={(next) => onChange(next)} />
    </Field>
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
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="flex-1 font-normal">
        {label}
      </FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => next !== null && onChange(String(next))}
      >
        <SelectTrigger id={id} className="max-w-[62%]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} side="bottom">
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
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
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => next[0] !== undefined && onChange(next[0] as T)}
      spacing={2}
      className={cn('w-full rounded-lg bg-muted p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          className="h-7 flex-1 rounded-md px-2 text-xs font-medium data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-sm"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  return (
    <Field orientation="horizontal" className="gap-2 rounded-lg border border-input px-2 py-1">
      <FieldLabel htmlFor={id} className="flex-1 font-normal">
        {label}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        value={Math.round(value)}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="h-7 w-20 border-0 bg-transparent px-1 text-right font-mono text-sm tabular-nums shadow-none focus-visible:ring-0"
      />
    </Field>
  )
}

export function IconButton({
  label,
  children,
  active,
  className,
  type = 'button',
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'aria-pressed'> & {
  label: string
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type={type}
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={active}
            className={cn('text-muted-foreground', active && 'bg-primary/10 text-primary', className)}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export type EditorButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'

const EDITOR_BUTTON_VARIANTS: Record<EditorButtonVariant, ComponentProps<typeof Button>['variant']> = {
  primary: 'default',
  secondary: 'outline',
  quiet: 'ghost',
  destructive: 'destructive',
}

export function EditorButton({
  variant = 'secondary',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant'> & { variant?: EditorButtonVariant }) {
  return <Button variant={EDITOR_BUTTON_VARIANTS[variant]} className={className} {...props} />
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
    <Field orientation="horizontal">
      <FieldTitle className="flex-1">{label}</FieldTitle>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{normalized}°</span>
        <svg
          ref={ref}
          viewBox="0 0 64 64"
          className="size-14 cursor-pointer touch-none rounded-full bg-muted"
          role="slider"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={normalized}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
              onCommit?.()
              onChange((normalized + 1) % 360)
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
              onCommit?.()
              onChange((normalized + 359) % 360)
            }
          }}
          onPointerDown={(event) => {
            onCommit?.()
            fromPointer(event.clientX, event.clientY)
            const move = (pointerEvent: PointerEvent) => fromPointer(pointerEvent.clientX, pointerEvent.clientY)
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
    </Field>
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
    onChange(stops.map((stop, i) => (i === index ? { ...stop, ...patch } : stop)))

  return (
    <FieldGroup className="gap-3">
      <FieldTitle>Gradient stops</FieldTitle>
      {stops.map((stop, index) => (
        <Field key={index} orientation="horizontal" className="items-start gap-2">
          <Input
            type="color"
            value={stop.color}
            aria-label={`Stop ${index + 1} color`}
            onFocus={onCommit}
            onChange={(event) => update(index, { color: event.target.value })}
            className="h-8 w-10 shrink-0 cursor-pointer p-1"
          />
          <div className="min-w-0 flex-1">
            <SliderField
              label={`Stop ${index + 1} position`}
              value={stop.position}
              min={0}
              max={100}
              suffix="%"
              onCommit={onCommit}
              onChange={(position) => update(index, { position })}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label={`Remove stop ${index + 1}`}
            disabled={stops.length <= 2}
            onClick={() => {
              onCommit?.()
              onChange(stops.filter((_, i) => i !== index))
            }}
          >
            Remove
          </Button>
        </Field>
      ))}
      {stops.length < 2 && <FieldDescription>A gradient needs at least 2 stops.</FieldDescription>}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={stops.length >= 8}
        onClick={() => {
          onCommit?.()
          onChange([...stops, { color: '#ffffff', position: Math.min(100, Math.round(100 / (stops.length + 1))) }])
        }}
      >
        Add stop
      </Button>
    </FieldGroup>
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
    <Tabs value={tab} onValueChange={(next) => setTab(next as ImageFillTab)} className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="curated">Curated</TabsTrigger>
        <TabsTrigger value="url">URL</TabsTrigger>
        <TabsTrigger value="upload">Upload</TabsTrigger>
      </TabsList>
      <TabsContent value="curated">
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Curated fills">
          {CURATED_FILLS.map((fill) => {
            const active = image.url === fill.url
            return (
              <Button
                key={fill.id}
                type="button"
                variant="ghost"
                aria-pressed={active}
                title={fill.label}
                aria-label={fill.label}
                onClick={() => {
                  onCommit?.()
                  onChange({ url: fill.url, fit: 'cover', scale: 100, position: 50 })
                }}
                className={cn(
                  'h-auto overflow-hidden rounded-lg p-0 ring-1 ring-border',
                  active && 'ring-2 ring-primary',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fill.url} alt={fill.label} className="aspect-square w-full object-cover" loading="lazy" />
              </Button>
            )
          })}
        </div>
      </TabsContent>
      <TabsContent value="url">
        <Field className="gap-2" data-invalid={urlError ? 'true' : undefined}>
          <div className="flex gap-2">
            <Input
              type="url"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyUrl()
                }
              }}
              placeholder="https://… or /api/uploads/…"
              aria-label="Image URL"
              aria-invalid={Boolean(urlError)}
            />
            <Button type="button" variant="secondary" onClick={applyUrl}>
              Apply
            </Button>
          </div>
          {urlError && <FieldError>{urlError}</FieldError>}
        </Field>
      </TabsContent>
      <TabsContent value="upload">
        <Field className="gap-2" data-invalid={uploadError ? 'true' : undefined}>
          <Input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => upload(event.target.files?.[0])}
            aria-label="Upload an image"
            className="text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
          />
          {uploading && <FieldDescription>Uploading…</FieldDescription>}
          {uploadError && <FieldError>{uploadError}</FieldError>}
        </Field>
      </TabsContent>
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
    </Tabs>
  )
}
