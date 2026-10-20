'use client'

import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import type { Preset } from '@/lib/types'
import { BUILTIN_COMBOS, WIDGETS, createWidget } from '@/lib/widgets'
import { BUILTIN_STICKERS, createStickerWidget } from '@/lib/text-stickers'
import { DRAG_MIME, type DropPayload } from './canvas'
import { WidgetPreview } from './widget-preview'

const CATEGORIES = ['Time', 'Weather', 'Planner', 'Decor'] as const

function dragProps(payload: DropPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'copy'
    },
  }
}

type LibraryPanelProps = {
  presets: Preset[]
  onAdd: (payload: DropPayload) => void
  onDeletePreset: (id: string) => void
}

export function LibraryPanel({ presets, onAdd, onDeletePreset }: LibraryPanelProps) {
  const samples = useMemo(() => Object.fromEntries(WIDGETS.map((d) => [d.type, createWidget(d.type)])), [])
  const combos = useMemo(() => BUILTIN_COMBOS.map((c) => ({ ...c, widgets: c.build() })), [])

  return (
    <div className="flex flex-col gap-6 p-4">
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Drag a widget onto the frame, or click to drop it in the center.
      </p>

      {CATEGORIES.map((category) => (
        <section key={category} className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</h3>
          <div className="grid grid-cols-2 gap-2">
            {WIDGETS.filter((d) => d.category === category).map((def) => (
              <button
                key={def.type}
                type="button"
                {...dragProps({ kind: 'widget', type: def.type })}
                onClick={() => onAdd({ kind: 'widget', type: def.type })}
                className="group flex cursor-grab flex-col overflow-hidden rounded-xl bg-secondary text-left ring-1 ring-border transition hover:ring-primary active:cursor-grabbing"
              >
                <WidgetPreview widgets={[samples[def.type]]} width={128} height={76} className="w-full" />
                <span className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-foreground">
                  <def.icon className="size-3.5 text-muted-foreground group-hover:text-primary" aria-hidden />
                  {def.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Combinations</h3>
        <div className="flex flex-col gap-2">
          {combos.map((combo) => (
            <button
              key={combo.id}
              type="button"
              {...dragProps({ kind: 'combo', id: combo.id })}
              onClick={() => onAdd({ kind: 'combo', id: combo.id })}
              className="flex cursor-grab items-center gap-3 overflow-hidden rounded-xl bg-secondary pr-3 text-left ring-1 ring-border transition hover:ring-primary"
            >
              <WidgetPreview widgets={combo.widgets} width={96} height={72} className="shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{combo.name}</span>
                <span className="truncate text-xs text-muted-foreground">{combo.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Text stickers</h3>
        <div className="flex flex-col gap-2">
          {BUILTIN_STICKERS.map((sticker) => {
            const widgets = [createStickerWidget(sticker)]
            return (
              <button
                key={sticker.id}
                type="button"
                {...dragProps({ kind: 'sticker', id: sticker.id })}
                onClick={() => onAdd({ kind: 'sticker', id: sticker.id })}
                className="flex cursor-grab items-center gap-3 overflow-hidden rounded-xl bg-secondary pr-3 text-left ring-1 ring-border transition hover:ring-primary"
              >
                <WidgetPreview widgets={widgets} width={96} height={72} className="shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{sticker.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{sticker.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My widgets</h3>
        {presets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
            Style a widget or group, then use the bookmark button in the inspector to save it here.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-3 overflow-hidden rounded-xl bg-secondary pr-1 ring-1 ring-border transition hover:ring-primary">
                <button
                  type="button"
                  {...dragProps({ kind: 'preset', id: preset.id })}
                  onClick={() => onAdd({ kind: 'preset', id: preset.id })}
                  className="flex min-w-0 flex-1 cursor-grab items-center gap-3 text-left"
                >
                  <WidgetPreview widgets={preset.widgets} width={96} height={72} className="shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{preset.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {preset.widgets.length} widget{preset.widgets.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${preset.name}`}
                  onClick={() => onDeletePreset(preset.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
