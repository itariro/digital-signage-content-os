'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { BUILTIN_FONTS, customFontId, fontStack } from '@/lib/fonts'
import { EditorButton, IconButton, Section } from './controls'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

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
    <div className="editor-panel flex flex-col">
      <Section title="Add a Google Font">
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Field className="gap-1">
            <FieldLabel htmlFor="font-family" className="text-xs text-muted-foreground">Font family</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="font-family"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="e.g. Fraunces"
                maxLength={60}
                className="min-w-0 flex-1"
              />
            <EditorButton type="submit" variant="primary" disabled={pending || !family.trim()}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
              Add
            </EditorButton>
            </div>
          </Field>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Type the exact family name from fonts.google.com. It becomes available in every widget&apos;s typeface picker.
          </p>
        </form>
      </Section>

      {customFonts.length > 0 && (
        <Section title="Custom fonts">
          <ul className="flex flex-col gap-2">
            {customFonts.map((f) => (
              <li key={f} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-2xl leading-tight text-foreground" style={{ fontFamily: fontStack(customFontId(f)) }}>
                    10:42 Aa
                  </span>
                  <span className="text-xs text-muted-foreground">{f}</span>
                </span>
                <IconButton label={`Remove ${f}`} onClick={() => onRemove(f)} className="hover:text-destructive">
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Built-in typefaces">
        <ul className="flex flex-col gap-2">
          {BUILTIN_FONTS.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
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
      </Section>
    </div>
  )
}
