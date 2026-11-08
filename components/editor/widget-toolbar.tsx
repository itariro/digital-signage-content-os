'use client'

import { useMemo, useState } from 'react'
import { Grid3x3, MoonStar, Scan, Search } from 'lucide-react'
import { WIDGETS } from '@/lib/widgets'
import type { WidgetType } from '@/lib/types'
import type { DropPayload, Overlay } from './canvas'
import { Segmented } from './controls'
import { cn } from '@/lib/utils'

const CHIPS = ['All', 'Time', 'Weather', 'Planner', 'Decor', 'Family'] as const
type Chip = (typeof CHIPS)[number]

type WidgetToolbarProps = {
  onAdd: (payload: DropPayload) => void
  overlay: Overlay
  onOverlayChange: (v: Overlay) => void
  nightPreview: boolean
  onToggleNight: () => void
}

export function WidgetToolbar({ onAdd, overlay, onOverlayChange, nightPreview, onToggleNight }: WidgetToolbarProps) {
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<Chip>('All')

  const results = useMemo(() => {
    const q = query.toLowerCase()
    return WIDGETS.filter(
      (w) => (!q || `${w.label} ${w.description} ${w.category}`.toLowerCase().includes(q)) && (chip === 'All' || w.category === chip),
    )
  }, [query, chip])

  return (
    <div className="editor-floating-surface absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain px-2 py-1.5 shadow-xl backdrop-blur" role="toolbar" aria-label="Widget tools">
      {/* 1. Unified search */}
      <div className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-secondary px-2.5">
        <Search className="size-4" aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search widgets…" className="h-8 w-44 bg-transparent text-sm outline-none" aria-label="Search widgets" />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        )}
      </div>

      {/* 2. Category chips */}
      {CHIPS.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={chip === c}
          onClick={() => setChip(c)}
          className={cn('h-8 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors', chip === c ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
        >
          {c}
        </button>
      ))}

      {/* 3. Quick-add icons (first 6) */}
      {results.slice(0, 6).map((w) => {
        const Icon = w.icon
        return (
          <button
            key={w.type}
            type="button"
            title={w.label}
            aria-label={`Add ${w.label}`}
            onClick={() => onAdd({ kind: 'widget', type: w.type as WidgetType })}
            className="editor-icon-button"
          >
            <Icon aria-hidden />
          </button>
        )
      })}

      {/* 4. Guides + Night */}
      <Segmented
        label="Composition guides"
        value={overlay}
        onChange={onOverlayChange}
        options={[
          { value: 'none', label: 'No guides' },
          { value: 'thirds', label: (<><Grid3x3 className="size-4" aria-hidden />Thirds</>) },
          { value: 'safe', label: (<><Scan className="size-4" aria-hidden />Safe area</>) },
        ]}
      />
      <button
        type="button"
        aria-pressed={nightPreview}
        onClick={onToggleNight}
        className={cn('flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors', nightPreview ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
      >
        <MoonStar className="size-4" aria-hidden />
        Night
      </button>
    </div>
  )
}
