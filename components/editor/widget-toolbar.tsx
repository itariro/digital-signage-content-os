'use client'

import { ChevronUp, LayoutGrid, MoreHorizontal, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { WIDGETS } from '@/lib/widgets'
import type { WidgetType } from '@/lib/types'
import type { DropPayload } from './canvas'
import { cn } from '@/lib/utils'

const groups = [
  { label: 'Widgets', categories: ['Time', 'Weather'] },
  { label: 'Planner', categories: ['Planner'] },
  { label: 'Decor', categories: ['Decor', 'Family'] },
] as const

export function WidgetToolbar({ onAdd }: { onAdd: (payload: DropPayload) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () => WIDGETS.filter((widget) => !query || `${widget.label} ${widget.description}`.toLowerCase().includes(query.toLowerCase())),
    [query],
  )

  return (
    <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur" aria-label="Widget tools">
      <button type="button" className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-label="Select tool">
        <LayoutGrid aria-hidden />
      </button>
      {groups.map((group) => {
        const items = visible.filter((widget) => group.categories.includes(widget.category as never))
        return (
          <div key={group.label} className="relative flex items-center border-l border-border px-1.5 first:border-l-0">
            {items.slice(0, 2).map((widget) => {
              const Icon = widget.icon
              return (
                <button key={widget.type} type="button" title={widget.label} aria-label={`Add ${widget.label}`} onClick={() => onAdd({ kind: 'widget', type: widget.type as WidgetType })} className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  <Icon aria-hidden />
                </button>
              )
            })}
            <button type="button" aria-label={`More ${group.label}`} aria-expanded={open === group.label} onClick={() => setOpen(open === group.label ? null : group.label)} className={cn('flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground', open === group.label && 'bg-secondary text-foreground')}>
              <ChevronUp aria-hidden />
            </button>
            {open === group.label && (
              <div className="absolute bottom-12 left-0 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl">
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-secondary px-2.5 text-sm text-muted-foreground">
                  <Search aria-hidden />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search widgets" className="h-9 min-w-0 flex-1 bg-transparent outline-none" aria-label="Search widgets" />
                </div>
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  {items.map((widget) => {
                    const Icon = widget.icon
                    return <button key={widget.type} type="button" onClick={() => { onAdd({ kind: 'widget', type: widget.type as WidgetType }); setOpen(null) }} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary"><Icon aria-hidden /><span className="flex-1">{widget.label}</span><span className="text-xs text-muted-foreground">{widget.category}</span></button>
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="border-l border-border pl-1.5"><button type="button" aria-label="More widget tools" className="flex size-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"><MoreHorizontal aria-hidden /></button></div>
    </div>
  )
}
