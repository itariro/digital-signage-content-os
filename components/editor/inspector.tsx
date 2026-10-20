'use client'

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  BookmarkPlus,
  Copy,
  Eye,
  EyeOff,
  Group,
  Lock,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react'
import type { Album, Widget, WidgetStyle } from '@/lib/types'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'
import { BUILTIN_FONTS, customFontId, fontStack } from '@/lib/fonts'
import { getDefinition } from '@/lib/widgets'
import type { EditorApi } from '@/hooks/use-editor'
import { ColorField, IconButton, NumberField, Section, Segmented, SelectField, SliderField, ThemeSwatches, ToggleField } from './controls'
import { LayoutSettingsPanel } from './layout-settings'
import { WidgetPreview } from './widget-preview'
import { cn } from '@/lib/utils'

type InspectorProps = {
  editor: EditorApi
  customFonts: string[]
  albums: Album[]
  onOpenAlbums: () => void
  onSavePreset: (widgets: Widget[]) => void
}

export function Inspector({ editor, customFonts, albums, onOpenAlbums, onSavePreset }: InspectorProps) {
  const { widgets, selected } = editor.state
  const selection = widgets.filter((w) => selected.includes(w.id))

  if (selection.length === 0) return <LayoutSettingsPanel editor={editor} albums={albums} onOpenAlbums={onOpenAlbums} />

  return (
    <div className="flex min-h-0 flex-col">
      <SelectionHeader editor={editor} selection={selection} onSavePreset={onSavePreset} />
      {selection.length === 1 && <TemplateSection editor={editor} widget={selection[0]} />}
      {selection.length === 1 && selection[0].type === 'sticker' && <StickerLayersSection editor={editor} widget={selection[0]} />}
      {selection.length === 1 && <ContentSection editor={editor} widget={selection[0]} />}
      {selection.length > 1 && <ArrangeSection editor={editor} selection={selection} />}
      <StyleSections editor={editor} selection={selection} customFonts={customFonts} />
      {selection.length === 1 && <GeometrySection editor={editor} widget={selection[0]} />}
    </div>
  )
}

function SelectionHeader({
  editor,
  selection,
  onSavePreset,
}: {
  editor: EditorApi
  selection: Widget[]
  onSavePreset: (widgets: Widget[]) => void
}) {
  const ids = selection.map((w) => w.id)
  const first = selection[0]
  const def = getDefinition(first.type)
  const allLocked = selection.every((w) => w.locked)
  const allHidden = selection.every((w) => w.hidden)
  const grouped = selection.some((w) => w.groupId)
  const Icon = def.icon

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {selection.length === 1 ? def.label : `${selection.length} widgets`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {selection.length === 1 ? def.description : grouped ? 'Grouped selection' : 'Multiple selection'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <IconButton label="Duplicate (⌘D)" onClick={() => editor.duplicateWidgets(selection)}>
          <Copy className="size-4" />
        </IconButton>
        <IconButton label={allLocked ? 'Unlock' : 'Lock'} active={allLocked} onClick={() => editor.updateWidgets(ids, (w) => ({ ...w, locked: !allLocked }))}>
          {allLocked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
        </IconButton>
        <IconButton label={allHidden ? 'Show' : 'Hide'} active={allHidden} onClick={() => editor.updateWidgets(ids, (w) => ({ ...w, hidden: !allHidden }))}>
          {allHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
        {selection.length === 1 && (
          <>
            <IconButton label="Bring to front" onClick={() => editor.reorder(first.id, 'top')}>
              <ArrowUpToLine className="size-4" />
            </IconButton>
            <IconButton label="Send to back" onClick={() => editor.reorder(first.id, 'bottom')}>
              <ArrowDownToLine className="size-4" />
            </IconButton>
          </>
        )}
        <IconButton label="Save to My widgets" onClick={() => onSavePreset(selection)}>
          <BookmarkPlus className="size-4" />
        </IconButton>
        <IconButton label="Delete (Del)" onClick={() => editor.removeWidgets(ids)} className="ml-auto hover:text-destructive">
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </div>
  )
}

function TemplateSection({ editor, widget }: { editor: EditorApi; widget: Widget }) {
  const def = getDefinition(widget.type)
  if (def.templates.length <= 1) return null
  return (
    <Section title="Design template">
      <div className="grid grid-cols-2 gap-2">
        {def.templates.map((t) => {
          const active = widget.template === t.id
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => editor.updateWidgets([widget.id], (w) => ({ ...w, template: t.id }))}
              className={cn(
                'flex flex-col overflow-hidden rounded-lg text-left ring-1 transition',
                active ? 'ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
              )}
            >
              <WidgetPreview widgets={[{ ...widget, template: t.id, x: 0, y: 0 }]} width={136} height={72} />
              <span className={cn('px-2 py-1.5 text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>{t.label}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

function ContentSection({ editor, widget }: { editor: EditorApi; widget: Widget }) {
  const def = getDefinition(widget.type)
  if (def.fields.length === 0) return null
  const setProp = (key: string, value: string | boolean, record = true) =>
    editor.updateWidgets([widget.id], (w) => ({ ...w, props: { ...w.props, [key]: value } }), record)

  return (
    <Section title="Content">
      {def.fields.map((field) => {
        if (field.showWhen && String(widget.props[field.showWhen.key]) !== field.showWhen.value) return null
        if (field.kind === 'date') {
          return (
            <label key={field.key} className="flex items-center justify-between gap-3 text-sm text-foreground">
              {field.label}
              <input
                type="date"
                value={String(widget.props[field.key] ?? '')}
                onChange={(e) => e.target.value && setProp(field.key, e.target.value)}
                className="h-8 rounded-md border border-border bg-secondary px-2 font-mono text-xs text-foreground outline-none [color-scheme:dark] focus-visible:border-primary"
              />
            </label>
          )
        }
        if (field.kind === 'toggle') {
          return <ToggleField key={field.key} label={field.label} checked={Boolean(widget.props[field.key])} onChange={(v) => setProp(field.key, v)} />
        }
        if (field.kind === 'select') {
          return (
            <SelectField
              key={field.key}
              label={field.label}
              value={String(widget.props[field.key] ?? field.options[0].value)}
              options={field.options}
              onChange={(v) => setProp(field.key, v)}
            />
          )
        }
        return (
          <label key={field.key} className="flex flex-col gap-1.5 text-sm text-foreground">
            {field.label}
            <input
              type="text"
              maxLength={120}
              value={String(widget.props[field.key] ?? '')}
              onFocus={() => editor.checkpoint()}
              onChange={(e) => setProp(field.key, e.target.value, false)}
              className="h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
        )
      })}
    </Section>
  )
}

function ArrangeSection({ editor, selection }: { editor: EditorApi; selection: Widget[] }) {
  const ids = selection.map((w) => w.id)
  const minX = Math.min(...selection.map((w) => w.x))
  const minY = Math.min(...selection.map((w) => w.y))
  const maxX = Math.max(...selection.map((w) => w.x + w.w))
  const maxY = Math.max(...selection.map((w) => w.y + w.h))
  const grouped = selection.length > 1 && selection.every((w) => w.groupId && w.groupId === selection[0].groupId)

  const align = (fn: (w: Widget) => Partial<Widget>) => editor.updateWidgets(ids, (w) => ({ ...w, ...fn(w) }))

  function distribute(axis: 'x' | 'y') {
    const size = axis === 'x' ? 'w' : 'h'
    const sorted = [...selection].sort((a, b) => a[axis] - b[axis])
    const start = sorted[0][axis]
    const end = Math.max(...sorted.map((w) => w[axis] + w[size]))
    const occupied = sorted.reduce((sum, w) => sum + w[size], 0)
    const gap = (end - start - occupied) / (sorted.length - 1)
    const positions = new Map<string, number>()
    let cursor = start
    sorted.forEach((w) => {
      positions.set(w.id, Math.round(cursor))
      cursor += w[size] + gap
    })
    editor.updateWidgets(ids, (w) => ({ ...w, [axis]: positions.get(w.id) ?? w[axis] }))
  }

  return (
    <Section title="Arrange & combine">
      <div className="grid grid-cols-6 gap-1">
        <IconButton label="Align left" onClick={() => align(() => ({ x: minX }))}><AlignStartVertical className="size-4" /></IconButton>
        <IconButton label="Align center" onClick={() => align((w) => ({ x: Math.round((minX + maxX) / 2 - w.w / 2) }))}><AlignCenterVertical className="size-4" /></IconButton>
        <IconButton label="Align right" onClick={() => align((w) => ({ x: maxX - w.w }))}><AlignEndVertical className="size-4" /></IconButton>
        <IconButton label="Align top" onClick={() => align(() => ({ y: minY }))}><AlignStartHorizontal className="size-4" /></IconButton>
        <IconButton label="Align middle" onClick={() => align((w) => ({ y: Math.round((minY + maxY) / 2 - w.h / 2) }))}><AlignCenterHorizontal className="size-4" /></IconButton>
        <IconButton label="Align bottom" onClick={() => align((w) => ({ y: maxY - w.h }))}><AlignEndHorizontal className="size-4" /></IconButton>
      </div>
      {selection.length > 2 && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => distribute('x')} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70">
            <AlignHorizontalDistributeCenter className="size-3.5" aria-hidden />
            Space horizontally
          </button>
          <button type="button" onClick={() => distribute('y')} className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70">
            <AlignVerticalDistributeCenter className="size-3.5" aria-hidden />
            Space vertically
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => (grouped ? editor.ungroup(ids) : editor.group(ids))}
        className="flex h-9 items-center justify-center gap-2 rounded-lg bg-secondary text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
      >
        {grouped ? <Ungroup className="size-4" aria-hidden /> : <Group className="size-4" aria-hidden />}
        {grouped ? 'Ungroup widgets' : 'Combine into group (⌘G)'}
      </button>
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Grouped widgets move together on the frame. Style changes below apply to every selected widget.
      </p>
    </Section>
  )
}

function StyleSections({ editor, selection, customFonts }: { editor: EditorApi; selection: Widget[]; customFonts: string[] }) {
  const ids = selection.map((w) => w.id)
  const s = selection[0].style
  const set = (patch: Partial<WidgetStyle>, record = true) => editor.updateStyle(ids, patch, record)
  const slide = (key: keyof WidgetStyle) => (v: number) => set({ [key]: v } as Partial<WidgetStyle>, false)
  const commit = () => editor.checkpoint()
  const fonts = [
    ...BUILTIN_FONTS.map((f) => ({ id: f.id, label: f.label })),
    ...customFonts.map((family) => ({ id: customFontId(family), label: family })),
  ]

  return (
    <>
      <Section title="Typeface">
        <div className="grid grid-cols-3 gap-1.5">
          {fonts.map((f) => {
            const active = s.fontFamily === f.id
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => set({ fontFamily: f.id })}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 ring-1 transition',
                  active ? 'bg-primary/10 ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
                )}
              >
                <span className="text-xl leading-none text-foreground" style={{ fontFamily: fontStack(f.id) }}>
                  12:45
                </span>
                <span className="w-full truncate text-center text-[11px] text-muted-foreground">{f.label}</span>
              </button>
            )
          })}
        </div>
        <SliderField label="Weight" value={s.fontWeight} min={100} max={900} step={100} onCommit={commit} onChange={slide('fontWeight')} />
        <SliderField label="Letter spacing" value={s.letterSpacing} min={-15} max={40} onCommit={commit} onChange={slide('letterSpacing')} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Alignment</span>
          <Segmented
            label="Text alignment"
            value={s.align}
            onChange={(v) => set({ align: v })}
            className="w-32"
            options={[
              { value: 'start', label: <AlignLeft className="size-3.5" aria-label="Left" />, title: 'Left' },
              { value: 'center', label: <AlignCenter className="size-3.5" aria-label="Center" />, title: 'Center' },
              { value: 'end', label: <AlignRight className="size-3.5" aria-label="Right" />, title: 'Right' },
            ]}
          />
        </div>
      </Section>

      <Section title="Color">
        <ThemeSwatches onApply={(style) => set(style)} />
        <ColorField label="Text" value={s.color} onChange={(v) => set({ color: v })} />
        <ColorField label="Accent" value={s.accent} onChange={(v) => set({ accent: v })} />
        <SliderField label="Opacity" value={s.opacity} min={10} max={100} suffix="%" onCommit={commit} onChange={slide('opacity')} />
        <ToggleField label="Soft shadow" checked={s.shadow} onChange={(v) => set({ shadow: v })} />
      </Section>

      <Section title="Surface">
        <ColorField label="Fill" value={s.bg} onChange={(v) => set({ bg: v })} />
        <SliderField label="Fill transparency" value={s.bgOpacity} min={0} max={100} suffix="%" onCommit={commit} onChange={slide('bgOpacity')} />
        <SliderField label="Glass blur" value={s.blur} min={0} max={60} suffix="px" onCommit={commit} onChange={slide('blur')} />
        <SliderField label="Corner radius" value={s.radius} min={0} max={300} suffix="px" onCommit={commit} onChange={slide('radius')} />
      </Section>

      <Section title="Stroke">
        <ColorField label="Stroke color" value={s.stroke} onChange={(v) => set({ stroke: v })} />
        <SliderField label="Border width" value={s.strokeWidth} min={0} max={24} suffix="px" onCommit={commit} onChange={slide('strokeWidth')} />
        <SliderField label="Text outline" value={s.textStroke} min={0} max={12} suffix="px" onCommit={commit} onChange={slide('textStroke')} />
      </Section>
    </>
  )
}

function StickerLayersSection({ editor, widget }: { editor: EditorApi; widget: Widget }) {
  const layers = widget.layers ?? []
  const updateLayer = (id: string, patch: Partial<NonNullable<Widget['layers']>[number]>, record = true) => {
    editor.updateWidgets(
      [widget.id],
      (w) => ({
        ...w,
        layers: (w.layers ?? []).map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
      }),
      record,
    )
  }
  const updateLayerStyle = (id: string, patch: Partial<Widget['style']>, record = true) => {
    editor.updateWidgets(
      [widget.id],
      (w) => ({
        ...w,
        layers: (w.layers ?? []).map((layer) =>
          layer.id === id ? { ...layer, style: { ...layer.style, ...patch } } : layer,
        ),
      }),
      record,
    )
  }

  return (
    <Section title="Sticker layers">
      {layers.length === 0 && <p className="text-xs text-muted-foreground">No layers.</p>}
      {layers.map((layer, index) => (
        <div key={layer.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <label className="flex flex-col gap-1.5 text-sm text-foreground">
            Layer {index + 1} text
            <input
              type="text"
              maxLength={300}
              value={layer.text}
              onFocus={() => editor.checkpoint()}
              onChange={(e) => updateLayer(layer.id, { text: e.target.value }, false)}
              className="h-9 rounded-md border border-border bg-secondary px-3 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Text color</span>
            <input
              type="color"
              value={layer.style.color}
              onFocus={() => editor.checkpoint()}
              onChange={(e) => updateLayerStyle(layer.id, { color: e.target.value }, false)}
              className="h-8 w-12 cursor-pointer rounded-md border border-border bg-secondary"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Accent</span>
            <input
              type="color"
              value={layer.style.accent}
              onFocus={() => editor.checkpoint()}
              onChange={(e) => updateLayerStyle(layer.id, { accent: e.target.value }, false)}
              className="h-8 w-12 cursor-pointer rounded-md border border-border bg-secondary"
            />
          </div>
        </div>
      ))}
    </Section>
  )
}

function GeometrySection({ editor, widget }: { editor: EditorApi; widget: Widget }) {
  const set = (patch: Partial<Widget>) => editor.updateWidgets([widget.id], (w) => ({ ...w, ...patch }))
  return (
    <Section
      title="Position & size"
      action={
        <button
          type="button"
          onClick={() => set({ x: Math.round(FRAME_WIDTH / 2 - widget.w / 2) })}
          className="text-xs font-medium text-primary hover:underline"
        >
          Center horizontally
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={widget.x} onChange={(x) => set({ x })} />
        <NumberField label="Y" value={widget.y} onChange={(y) => set({ y: Math.min(FRAME_HEIGHT, y) })} />
        <NumberField label="W" value={widget.w} onChange={(w) => set({ w: Math.max(getDefinition(widget.type).minSize.w, w) })} />
        <NumberField label="H" value={widget.h} onChange={(h) => set({ h: Math.max(getDefinition(widget.type).minSize.h, h) })} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Units are frame pixels on a 1080 × 1920 design grid and scale automatically for 1440 × 2560 frames.
      </p>
    </Section>
  )
}
