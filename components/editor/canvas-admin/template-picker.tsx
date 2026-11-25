'use client'

import type { CanvasTemplateId } from '@/lib/types'
import { CANVAS_TEMPLATES } from '@/lib/canvas/templates'

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
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium">Starter shows</h4>
        <button type="button" className="text-xs text-muted-foreground" onClick={onClose}>
          Close
        </button>
      </div>
      <ul className="grid gap-2">
        {CANVAS_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className="w-full rounded border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => onPick(template.id)}
            >
              <span className="block font-medium">{template.name}</span>
              <span className="block text-xs text-muted-foreground">{template.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
