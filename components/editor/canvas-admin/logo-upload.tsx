'use client'

import { useRef, useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { downscaleToDataUri } from '@/lib/frame-utils'

export function LogoUpload({
  value,
  accept,
  maxBytes,
  onChange,
}: {
  value: string
  accept: string[]
  maxBytes: number
  onChange: (value: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      if (!accept.includes(file.type)) throw new Error(`Use ${accept.join(', ')}`)
      const dataUri = await downscaleToDataUri(file, 512, file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png')
      if (!dataUri.startsWith('data:image/')) throw new Error('Image encoding failed')
      if (dataUri.length > maxBytes * 2) throw new Error('Logo is too large')
      onChange(dataUri)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That image could not be used')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.startsWith('data:image/') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Logo preview" className="h-20 w-auto max-w-full rounded border border-border object-contain" />
      ) : (
        <p className="rounded border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">No image</p>
      )}
      <Input
        ref={input}
        type="file"
        accept={accept.join(',')}
        aria-label="Upload logo"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <EditorButton type="button" variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? 'Processing…' : value ? 'Replace image' : 'Choose image'}
      </EditorButton>
      {value && (
        <EditorButton type="button" variant="quiet" onClick={() => onChange('')}>Remove image</EditorButton>
      )}
      {error && <FieldError className="text-[11px]">{error}</FieldError>}
      <p className="text-[11px] text-muted-foreground">Stored in the scene as a data URI. Kiosks never fetch an upload URL.</p>
    </div>
  )
}
