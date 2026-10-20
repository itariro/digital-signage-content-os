'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Check, ExternalLink, Monitor, Pencil, Plus, Trash2 } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((response) => response.json())
type Frame = { id: string; name: string; layoutId: string | null; layoutName: string | null; layouts: { id: string; name: string }[]; resolutionWidth: number; resolutionHeight: number; screenWidthMm: number | null; screenHeightMm: number | null }
type FormState = { id: string; name: string; resolutionWidth: string; resolutionHeight: string; screenWidthMm: string; screenHeightMm: string }
const blank: FormState = { id: '', name: '', resolutionWidth: '1920', resolutionHeight: '1080', screenWidthMm: '', screenHeightMm: '' }

export function FrameSwitcher({ singleFrame = false }: { singleFrame?: boolean }) {
  const { data: frames = [], mutate } = useSWR<Frame[]>('/api/frames', fetcher, { revalidateOnFocus: true })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function saveFrame() {
    if (!editing) return
    setBusy(true); setMessage('')
    const isNew = !frames.some((frame) => frame.id === editing.id)
    const response = await fetch('/api/frames', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
    const result = await response.json()
    setBusy(false)
    if (!response.ok) { setMessage(result.error ?? 'Could not save frame'); return }
    setEditing(null); await mutate()
  }

  async function removeFrame(id: string) {
    if (!window.confirm(`Remove frame “${id}”?`)) return
    setBusy(true); await fetch(`/api/frames?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await mutate(); setBusy(false)
  }

  async function assignLayout(frame: Frame, layoutId: string) {
    await fetch('/api/frames', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: frame.id, layoutId: layoutId || null }) })
    await mutate()
  }

  return <details
    className="relative shrink-0"
    open={open}
    onToggle={(event) => {
      const nextOpen = event.currentTarget.open
      setOpen(nextOpen)
      if (nextOpen) void mutate()
    }}
  >
    <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <Monitor className="size-3.5 text-primary" aria-hidden /><span className="hidden sm:inline">Frames</span><span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{frames.length}</span>
    </summary>
    <div className="absolute right-0 top-10 z-50 w-[min(92vw,27rem)] overflow-hidden rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
      <div className="flex items-start justify-between border-b border-border px-2 pb-2"><div><p className="text-sm font-semibold">Frame directory</p><p className="mt-0.5 text-xs text-muted-foreground">{singleFrame ? 'This screen manages only the home frame.' : 'Target specs and the layout assigned to each screen.'}</p></div>{!singleFrame && <button type="button" className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground" onClick={() => { setEditing({ ...blank }); setMessage('') }}><Plus className="size-3" />Add</button>}</div>
      {editing && <div className="my-2 rounded-lg border border-border bg-background p-3"><div className="grid grid-cols-2 gap-2"><label className="col-span-2 text-xs text-muted-foreground">Name<input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Frame ID<input disabled={frames.some((frame) => frame.id === editing.id)} value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} placeholder="kitchen-display" className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Resolution<input value={`${editing.resolutionWidth}x${editing.resolutionHeight}`} onChange={(e) => { const [width, height] = e.target.value.split('x'); setEditing({ ...editing, resolutionWidth: width ?? '', resolutionHeight: height ?? '' }) }} className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Screen width (mm)<input value={editing.screenWidthMm} onChange={(e) => setEditing({ ...editing, screenWidthMm: e.target.value })} placeholder="optional" className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" /></label><label className="text-xs text-muted-foreground">Screen height (mm)<input value={editing.screenHeightMm} onChange={(e) => setEditing({ ...editing, screenHeightMm: e.target.value })} placeholder="optional" className="mt-1 h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground" /></label></div>{message && <p className="mt-2 text-xs text-destructive">{message}</p>}<div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary">Cancel</button><button type="button" disabled={busy} onClick={saveFrame} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save frame'}</button></div></div>}
      <div className="mt-2 max-h-[26rem] space-y-1 overflow-y-auto">{frames.map((frame) => <div key={frame.id} className="rounded-lg px-2 py-2.5 hover:bg-secondary"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Monitor className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{frame.name}</span><code className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">{frame.id}</code></div><p className="text-[11px] text-muted-foreground">{frame.resolutionWidth}×{frame.resolutionHeight}{frame.screenWidthMm ? ` · ${frame.screenWidthMm}×${frame.screenHeightMm} mm` : ''}</p><label className="mt-2 block text-[11px] text-muted-foreground">Assigned layout<select value={frame.layoutId ?? ''} onChange={(e) => assignLayout(frame, e.target.value)} className="ml-2 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground"><option value="">No layout</option>{frame.layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}</select>{frame.layoutId && <Check className="ml-1 inline size-3 text-primary" />}</label></div><div className="flex shrink-0 gap-1"><a href={`/frame/${encodeURIComponent(frame.id)}`} target="_blank" rel="noreferrer" aria-label={`Open ${frame.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"><ExternalLink className="size-3.5" /></a><button type="button" aria-label={`Edit ${frame.name}`} onClick={() => setEditing({ id: frame.id, name: frame.name, resolutionWidth: String(frame.resolutionWidth), resolutionHeight: String(frame.resolutionHeight), screenWidthMm: frame.screenWidthMm ? String(frame.screenWidthMm) : '', screenHeightMm: frame.screenHeightMm ? String(frame.screenHeightMm) : '' })} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"><Pencil className="size-3.5" /></button>{frame.id !== 'home' && <button type="button" aria-label={`Remove ${frame.name}`} onClick={() => removeFrame(frame.id)} className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-destructive"><Trash2 className="size-3.5" /></button>}</div></div></div>)}</div>
      <div className="mt-2 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">Frame URLs use <code className="text-foreground">/frame/&lt;id&gt;</code>. Resolution and physical size help select compatible layouts.</div>
    </div>
  </details>
}
