'use client'

import type { CanvasTemplateId } from '@/lib/types'
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates'
import { Button } from '@/components/ui/button'

export function TemplatePicker({
  onPick,
  onClose,
  disabled = false,
}: {
  onPick: (id: CanvasTemplateId) => void
  onClose: () => void
  disabled?: boolean
}) {
  return (
    <div className="mt-3 rounded-md border border-border bg-card p-3" role="group" aria-label="Starter shows">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">Starter shows</h4>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={onClose}>
          Close
        </Button>
      </div>
      <ul className="grid gap-2">
        {CANVAS_TEMPLATES.map((template) => (
          <li key={template.id}>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full justify-start rounded-md px-3 py-2 text-left"
              disabled={disabled}
              onClick={() => onPick(template.id)}
            >
              <span className="block w-full">
                <span className="block text-sm font-medium text-foreground">{template.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{template.description}</span>
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
