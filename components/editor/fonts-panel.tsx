'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { BUILTIN_FONTS, customFontId, fontStack } from '@/lib/fonts'

type FontsPanelProps = {
  customFonts: string[]
  onAdd: (family: string) => Promise<void>
  onRemove: (family: string) => void
}

export function FontsPanel({ customFonts, onAdd, onRemove }: FontsPanelProps) {
  const [family, setFamily] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!family.trim() || pending) return
    setPending(true)
    try {
      await onAdd(family.trim())
      setFamily('')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="font-family" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Add a Google Font
        </label>
        <div className="flex gap-2">
          <input
            id="font-family"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            placeholder="e.g. Fraunces"
            maxLength={60}
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          <button
            type="submit"
            disabled={pending || !family.trim()}
            className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Add
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Type the exact family name from fonts.google.com. It becomes available in every widget&apos;s typeface picker.
        </p>
      </form>

      {customFonts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom fonts</h3>
          <ul className="flex flex-col gap-2">
            {customFonts.map((f) => (
              <li key={f} className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-3 ring-1 ring-border">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xl leading-tight text-foreground" style={{ fontFamily: fontStack(customFontId(f)) }}>
                    10:42 Aa
                  </span>
                  <span className="text-xs text-muted-foreground">{f}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f}`}
                  onClick={() => onRemove(f)}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Built-in typefaces</h3>
        <ul className="flex flex-col gap-2">
          {BUILTIN_FONTS.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-3 ring-1 ring-border">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl leading-tight text-foreground" style={{ fontFamily: f.css }}>
                  10:42 Aa
                </span>
                <span className="text-xs text-muted-foreground">
                  {f.label} · {f.category}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
