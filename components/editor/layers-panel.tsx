'use client'

import { ChevronDown, ChevronUp, Eye, EyeOff, Link2, Lock, Unlock } from 'lucide-react'
import type { EditorApi } from '@/hooks/use-editor'
import { getDefinition } from '@/lib/widgets'
import { IconButton } from './controls'
import { cn } from '@/lib/utils'

export function LayersPanel({ editor }: { editor: EditorApi }) {
  const { widgets, selected } = editor.state
  const ordered = [...widgets].reverse()

  if (widgets.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">No widgets yet. Add some from the Widgets tab.</p>
  }

  return (
    <ul className="flex flex-col gap-1 p-2" aria-label="Layers, top to bottom">
      {ordered.map((w, i) => {
        const def = getDefinition(w.type)
        const template = def.templates.find((t) => t.id === w.template)?.label
        const isSelected = selected.includes(w.id)
        return (
          <li
            key={w.id}
            className={cn(
              'flex items-center gap-0.5 rounded-md pl-1.5 pr-0.5 transition-colors',
              isSelected ? 'bg-primary/15' : 'hover:bg-secondary',
              w.hidden && 'opacity-50',
            )}
          >
            <button
              type="button"
              onClick={(e) => {
                if (e.shiftKey || e.metaKey) {
                  editor.select(isSelected ? selected.filter((id) => id !== w.id) : [...selected, w.id])
                } else {
                  editor.select([w.id])
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
            >
              <def.icon className={cn('size-3.5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-foreground">
                  {w.type === 'text' ? String(w.props.text || def.label) : def.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">{template}</span>
              </span>
              {w.groupId && <Link2 className="size-3.5 shrink-0 text-primary" aria-label="Grouped" />}
            </button>
            <IconButton label="Move up" disabled={i === 0} onClick={() => editor.reorder(w.id, 'up')}>
              <ChevronUp className="size-4" />
            </IconButton>
            <IconButton label="Move down" disabled={i === ordered.length - 1} onClick={() => editor.reorder(w.id, 'down')}>
              <ChevronDown className="size-4" />
            </IconButton>
            <IconButton label={w.hidden ? 'Show' : 'Hide'} onClick={() => editor.updateWidgets([w.id], (x) => ({ ...x, hidden: !x.hidden }))}>
              {w.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </IconButton>
            <IconButton label={w.locked ? 'Unlock' : 'Lock'} onClick={() => editor.updateWidgets([w.id], (x) => ({ ...x, locked: !x.locked }))}>
              {w.locked ? <Lock className="size-4 text-primary" /> : <Unlock className="size-4" />}
            </IconButton>
          </li>
        )
      })}
    </ul>
  )
}
