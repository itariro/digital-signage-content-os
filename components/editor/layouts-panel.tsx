'use client'

import { useRef } from 'react'
import { Copy, FileUp, MonitorCheck, Plus, Trash2 } from 'lucide-react'
import type { Layout } from '@/lib/types'
import { FrameScene } from '@/components/frame/frame-scene'
import { IconButton } from './controls'
import { useLiveData } from './widget-preview'
import { cn } from '@/lib/utils'

type LayoutsPanelProps = {
  layouts: Layout[]
  activeId: string | null
  editingId: string
  onOpen: (id: string) => void
  onCreate: () => void
  onDuplicate: (layout: Layout) => void
  onDelete: (layout: Layout) => void
  onActivate: (id: string) => void
  onImport: (file: File) => void
}

export function LayoutsPanel({ layouts, activeId, editingId, onOpen, onCreate, onDuplicate, onDelete, onActivate, onImport }: LayoutsPanelProps) {
  const { now, weather } = useLiveData()
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCreate}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" aria-hidden />
          New layout
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          <FileUp className="size-4" aria-hidden />
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.target.value = ''
          }}
        />
      </div>

      <ul className="flex flex-col gap-2">
        {layouts.map((layout) => {
          const editing = layout.id === editingId
          const active = layout.id === activeId
          return (
            <li
              key={layout.id}
              className={cn(
                'flex gap-3 rounded-xl p-2 ring-1 transition',
                editing ? 'bg-primary/10 ring-primary' : 'bg-secondary ring-border hover:ring-muted-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(layout.id)}
                aria-label={`Open ${layout.name}`}
                className="shrink-0 overflow-hidden rounded-md ring-1 ring-border"
              >
                <FrameScene widgets={layout.widgets} settings={layout.settings} weather={weather} now={now} scale={0.07} />
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <button type="button" onClick={() => onOpen(layout.id)} className="text-left">
                  <span className="block truncate text-sm font-medium text-foreground">{layout.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {layout.widgets.length} widgets · {layout.settings.resolution.split('x')[0]}p
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Edited {new Date(layout.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </button>
                <div className="mt-auto flex items-center gap-0.5 pt-2">
                  {active ? (
                    <span className="flex h-7 items-center gap-1 rounded-full bg-primary/15 px-2.5 text-xs font-medium text-primary">
                      <MonitorCheck className="size-3.5" aria-hidden />
                      On frame
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onActivate(layout.id)}
                      className="h-7 rounded-full bg-card px-2.5 text-xs font-medium text-foreground ring-1 ring-border hover:ring-primary"
                    >
                      Show on frame
                    </button>
                  )}
                  <IconButton label={`Duplicate ${layout.name}`} onClick={() => onDuplicate(layout)} className="ml-auto size-7">
                    <Copy className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Delete ${layout.name}`}
                    onClick={() => onDelete(layout)}
                    disabled={layouts.length <= 1}
                    className="size-7 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
