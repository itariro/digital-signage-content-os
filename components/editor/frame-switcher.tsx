'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Check, ExternalLink, Monitor, Pencil, Plus, Trash2 } from 'lucide-react'
import { EditorButton, IconButton } from './controls'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

type Frame = { id: string; name: string; layoutId: string | null; layoutName: string | null; layouts: { id: string; name: string }[]; resolutionWidth: number; resolutionHeight: number; screenWidthMm: number | null; screenHeightMm: number | null }

export async function fetchFrames(url: string): Promise<Frame[]> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load frames (HTTP ${response.status})`)
  const result: unknown = await response.json()
  if (!Array.isArray(result)) throw new Error('Unexpected frames response')
  return result as Frame[]
}

type FormState = { id: string; name: string; resolutionWidth: string; resolutionHeight: string; screenWidthMm: string; screenHeightMm: string }
const blank: FormState = { id: '', name: '', resolutionWidth: '1920', resolutionHeight: '1080', screenWidthMm: '', screenHeightMm: '' }

export function FrameSwitcher({ singleFrame = false }: { singleFrame?: boolean }) {
  const { data, mutate } = useSWR<Frame[]>('/api/frames', fetchFrames, { revalidateOnFocus: true })
  const frames = Array.isArray(data) ? data : []
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

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void mutate()
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-transparent px-2.5 text-xs font-medium"
          />
        }
      >
        <Monitor className="size-4 text-primary" aria-hidden />
        <span className="hidden sm:inline">Frames</span>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">{frames.length}</Badge>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,27rem)] gap-0 p-0">
        <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Frame directory</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {singleFrame ? 'This screen manages only the home frame.' : 'Target specs and the layout assigned to each screen.'}
            </p>
          </div>
          {!singleFrame && (
            <EditorButton
              type="button"
              variant="primary"
              className="shrink-0 px-2 text-xs font-semibold"
              onClick={() => { setEditing({ ...blank }); setMessage('') }}
            >
              <Plus className="size-4" />
              Add
            </EditorButton>
          )}
        </div>

        {editing && (
          <div className="mx-3 my-2 rounded-lg border border-border bg-background p-3">
            <FieldGroup className="gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Field className="col-span-2 gap-1">
                  <FieldLabel htmlFor="frame-name">Name</FieldLabel>
                  <Input
                    id="frame-name"
                    autoFocus
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor="frame-id">Frame ID</FieldLabel>
                  <Input
                    id="frame-id"
                    disabled={frames.some((frame) => frame.id === editing.id)}
                    value={editing.id}
                    onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                    placeholder="kitchen-display"
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor="frame-resolution">Resolution</FieldLabel>
                  <Input
                    id="frame-resolution"
                    value={`${editing.resolutionWidth}x${editing.resolutionHeight}`}
                    onChange={(e) => {
                      const [width, height] = e.target.value.split('x')
                      setEditing({ ...editing, resolutionWidth: width ?? '', resolutionHeight: height ?? '' })
                    }}
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor="frame-screen-width">Screen width (mm)</FieldLabel>
                  <Input
                    id="frame-screen-width"
                    value={editing.screenWidthMm}
                    onChange={(e) => setEditing({ ...editing, screenWidthMm: e.target.value })}
                    placeholder="optional"
                  />
                </Field>
                <Field className="gap-1">
                  <FieldLabel htmlFor="frame-screen-height">Screen height (mm)</FieldLabel>
                  <Input
                    id="frame-screen-height"
                    value={editing.screenHeightMm}
                    onChange={(e) => setEditing({ ...editing, screenHeightMm: e.target.value })}
                    placeholder="optional"
                  />
                </Field>
              </div>
              {message && <FieldError>{message}</FieldError>}
              <div className="flex justify-end gap-2">
                <EditorButton type="button" variant="quiet" className="px-2 text-xs text-muted-foreground" onClick={() => setEditing(null)}>
                  Cancel
                </EditorButton>
                <EditorButton type="button" variant="primary" className="px-3 text-xs font-semibold" disabled={busy} onClick={saveFrame}>
                  {busy ? 'Saving…' : 'Save frame'}
                </EditorButton>
              </div>
            </FieldGroup>
          </div>
        )}

        <ScrollArea className="max-h-[26rem] [&_[data-slot=scroll-area-viewport]]:max-h-[26rem]">
          <div className="space-y-1 p-2">
            {frames.map((frame) => (
              <div key={frame.id} className="rounded-lg px-2 py-2.5 hover:bg-secondary">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Monitor className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{frame.name}</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">{frame.id}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {frame.resolutionWidth}×{frame.resolutionHeight}
                      {frame.screenWidthMm ? ` · ${frame.screenWidthMm}×${frame.screenHeightMm} mm` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Select
                        items={[{ value: 'none', label: 'No layout' }, ...frame.layouts.map((layout) => ({ value: layout.id, label: layout.name }))]}
                        value={frame.layoutId ?? 'none'}
                        onValueChange={(next) => next !== null && void assignLayout(frame, next === 'none' ? '' : String(next))}
                      >
                        <SelectTrigger size="sm" aria-label={`Assigned layout for ${frame.name}`} className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value="none">No layout</SelectItem>
                            {frame.layouts.map((layout) => (
                              <SelectItem key={layout.id} value={layout.id}>{layout.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {frame.layoutId && <Check className="size-3 text-primary" aria-hidden />}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <a
                      href={`/frame/${encodeURIComponent(frame.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${frame.name}`}
                      className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                    <IconButton
                      label={`Edit ${frame.name}`}
                      onClick={() => setEditing({ id: frame.id, name: frame.name, resolutionWidth: String(frame.resolutionWidth), resolutionHeight: String(frame.resolutionHeight), screenWidthMm: frame.screenWidthMm ? String(frame.screenWidthMm) : '', screenHeightMm: frame.screenHeightMm ? String(frame.screenHeightMm) : '' })}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </IconButton>
                    {frame.id !== 'home' && (
                      <IconButton label={`Remove ${frame.name}`} onClick={() => removeFrame(frame.id)} className="hover:text-destructive">
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          Frame URLs use <code className="text-foreground">/frame/&lt;id&gt;</code>. Resolution and physical size help select compatible layouts.
        </div>
      </PopoverContent>
    </Popover>
  )
}
