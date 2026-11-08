'use client'

import { useMemo, useState } from 'react'
import { Trash2, X } from 'lucide-react'
import type { Preset } from '@/lib/types'
import { BUILTIN_COMBOS, WIDGETS, createWidget, getDefinition } from '@/lib/widgets'
import { BUILTIN_STICKERS, createStickerWidget } from '@/lib/text-stickers'
import {
  matchesLibrarySearch,
  matchesWidgetCategory,
  WIDGET_LIBRARY_CATEGORIES,
  type WidgetLibraryCategory,
} from '@/lib/editor-library'
import { DRAG_MIME, type DropPayload } from './canvas'
import { WidgetPreview } from './widget-preview'

function dragProps(payload: DropPayload, onClose: () => void) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'copy'
    },
    onDragEnd: (e: React.DragEvent) => {
      if (e.dataTransfer.dropEffect === 'copy') onClose()
    },
  }
}

type LibraryPanelProps = {
  presets: Preset[]
  onAdd: (payload: DropPayload) => void
  onDeletePreset: (id: string) => void
  onClose: () => void
}

export function LibraryPanel({ presets, onAdd, onDeletePreset, onClose }: LibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<WidgetLibraryCategory>('All')
  const samples = useMemo(() => Object.fromEntries(WIDGETS.map((d) => [d.type, createWidget(d.type)])), [])
  const combos = useMemo(() => BUILTIN_COMBOS.map((c) => ({ ...c, widgets: c.build() })), [])
  const visibleWidgets = WIDGETS.filter(
    (widget) =>
      matchesWidgetCategory(category, widget.category) &&
      matchesLibrarySearch(query, [widget.label, widget.description, widget.category]),
  )
  const visibleCombos = combos.filter((combo) =>
    matchesLibrarySearch(query, [combo.name, combo.description]),
  )
  const visibleStickers = BUILTIN_STICKERS.filter((sticker) =>
    matchesLibrarySearch(query, [sticker.name, sticker.description]),
  )
  const visiblePresets = presets.filter((preset) =>
    matchesLibrarySearch(query, [
      preset.name,
      String(preset.widgets.length),
      ...preset.widgets.map((widget) => getDefinition(widget.type).label),
    ]),
  )
  const widgetCategories =
    category === 'All' ? WIDGET_LIBRARY_CATEGORIES.slice(1) : [category]

  return (
    <div className="flex flex-col gap-6 p-4">
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Drag a widget onto the frame, or click to drop it in the center.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="library-search" className="sr-only">Search library</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
          <input
            id="library-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search widgets, combinations, stickers…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <div
          role="group"
          aria-label="Filter widgets by category"
          className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
        >
          {WIDGET_LIBRARY_CATEGORIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                category === option
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <section aria-label={`${category} widgets`} className="flex flex-col gap-4">
        {widgetCategories.map((widgetCategory) => {
          const widgets = visibleWidgets.filter((widget) => widget.category === widgetCategory)
          return (
            <section key={widgetCategory} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{widgetCategory}</h3>
              {widgets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
                  No {widgetCategory.toLowerCase()} widgets match your search.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {widgets.map((def) => (
                    <button
                      key={def.type}
                      type="button"
                      {...dragProps({ kind: 'widget', type: def.type }, onClose)}
                      onClick={() => onAdd({ kind: 'widget', type: def.type })}
                      className="group flex min-w-0 cursor-grab items-center gap-2 overflow-hidden rounded-lg bg-secondary p-2 text-left ring-1 ring-border transition hover:ring-primary active:cursor-grabbing"
                    >
                      <WidgetPreview widgets={[samples[def.type]]} width={72} height={48} className="shrink-0 rounded-md" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                          <def.icon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                          <span className="truncate">{def.label}</span>
                        </span>
                        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{def.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Combinations</h3>
        {visibleCombos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
            No combinations match your search.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleCombos.map((combo) => (
              <button
                key={combo.id}
                type="button"
                {...dragProps({ kind: 'combo', id: combo.id }, onClose)}
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
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Text stickers</h3>
        {visibleStickers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
            No text stickers match your search.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleStickers.map((sticker) => {
              const widgets = [createStickerWidget(sticker)]
              return (
                <button
                  key={sticker.id}
                  type="button"
                  {...dragProps({ kind: 'sticker', id: sticker.id }, onClose)}
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
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My widgets</h3>
        {presets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
            Style a widget or group, then use the bookmark button in the inspector to save it here.
          </p>
        ) : visiblePresets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs leading-relaxed text-muted-foreground">
            No saved widgets match your search.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {visiblePresets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-3 overflow-hidden rounded-xl bg-secondary pr-1 ring-1 ring-border transition hover:ring-primary">
                <button
                  type="button"
                  {...dragProps({ kind: 'preset', id: preset.id }, onClose)}
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
