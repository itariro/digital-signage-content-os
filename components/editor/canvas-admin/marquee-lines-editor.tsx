'use client'

import { useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { withMeasuredStrip } from '@/lib/canvas/measure-client'

export function MarqueeLinesEditor({
  value,
  maxLines,
  maxLength,
  colorMode = false,
  onChange,
}: {
  value: string[]
  maxLines: number
  maxLength: number
  colorMode?: boolean
  onChange: (value: string[] | Record<string, unknown>) => void
}) {
  const [draft, setDraft] = useState(value.join('\n'))
  const [error, setError] = useState<string | null>(null)

  function commit(next: string) {
    setDraft(next)
    const lines = next.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0 || lines.length > maxLines) {
      setError(`Use between 1 and ${maxLines} entries`)
      return
    }
    if (lines.some((line) => line.length > maxLength)) {
      setError(`Each entry must be ${maxLength} characters or fewer`)
      return
    }
    setError(null)
    if (colorMode) {
      onChange({ colors: lines })
      return
    }
    try {
      const config = withMeasuredStrip({ lines } as never)
      onChange({ lines, strip: (config as { strip?: unknown }).strip ?? null })
    } catch {
      onChange({ lines })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label={colorMode ? 'Colours' : 'Marquee lines'}
        rows={Math.min(12, Math.max(3, value.length + 1))}
        maxLength={maxLength * maxLines}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        className="editor-control min-h-20 w-full p-2 font-mono text-xs"
      />
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        {value.length}/{maxLines} entries. Strip measurements are written to config on save.
      </p>
      <EditorButton
        type="button"
        variant="quiet"
        onClick={() => {
          setDraft('')
          onChange(colorMode ? { colors: [] } : { lines: [] })
        }}
      >
        Clear
      </EditorButton>
    </div>
  )
}
