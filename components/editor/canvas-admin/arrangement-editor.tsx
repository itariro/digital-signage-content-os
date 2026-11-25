'use client'

import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { EditorButton, SelectField, SliderField } from '@/components/editor/controls'
import { resolveGeometry, validateGeometry } from '@/lib/canvas/geometry'
import { nanoid } from 'nanoid'
import type { Album, CanvasConfig, CanvasSlot, FrameStore, Layout } from '@/lib/types'
import type { CanvasFrame } from '@/hooks/use-canvas-library'
import { WallPreview } from './wall-preview'

const ALIGN_OPTIONS = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
]

export function ArrangementEditor({
  layout,
  store,
  frames,
  dirty,
  onChange,
}: {
  layout: Layout
  store: FrameStore
  frames: CanvasFrame[]
  dirty: boolean
  onChange: (layout: Layout) => void
}) {
  const config = layout.canvas as CanvasConfig
  const geometry = useMemo(() => resolveGeometry(config), [config])
  const issues = useMemo(() => validateGeometry(geometry), [geometry])
  const canvasAlbums = store.albums.filter((album) => album.theme === 'canvas')
  const album: Album | null = canvasAlbums.find((entry) => entry.id === layout.settings.albumId) ?? null

  function updateConfig(next: CanvasConfig) {
    onChange({ ...layout, canvas: next })
  }

  function updateSlot(id: string, fn: (slot: CanvasSlot) => CanvasSlot) {
    updateConfig({ ...config, slots: config.slots.map((slot) => slot.id === id ? fn(slot) : slot) })
  }

  function addSlot(frameId: string | null) {
    updateConfig({
      ...config,
      slots: [...config.slots, { id: nanoid(6), frameId, offset: { x: 0, y: 0 }, scale: 1 }],
    })
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
        <span aria-live="polite" className={dirty ? 'text-amber-600' : 'text-muted-foreground'}>
          {dirty ? 'Unpublished changes' : 'All changes saved'}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="canvas-layout-name" className="text-xs font-medium">Layout name</label>
        <input
          id="canvas-layout-name"
          value={layout.name}
          maxLength={80}
          onChange={(e) => onChange({ ...layout, name: e.target.value })}
          className="editor-control h-9 w-full px-2"
        />
      </div>

      <SelectField
        label="Arrangement"
        value={config.arrangement}
        options={[
          { value: 'row', label: 'Row' },
          { value: 'column', label: 'Column' },
          { value: 'grid', label: 'Grid' },
        ]}
        onChange={(v) => updateConfig({ ...config, arrangement: v as CanvasConfig['arrangement'] })}
      />
      {config.arrangement === 'grid' && (
        <SliderField label="Grid columns" value={config.gridColumns ?? 2} min={1} max={8} step={1} onChange={(v) => updateConfig({ ...config, gridColumns: v })} />
      )}
      <SliderField label="Gap" value={config.gap} min={0} max={160} step={2} suffix="px" onChange={(v) => updateConfig({ ...config, gap: v })} />
      <SelectField label="Alignment" value={config.align} options={ALIGN_OPTIONS} onChange={(v) => updateConfig({ ...config, align: v as CanvasConfig['align'] })} />

      <section aria-label="Frames" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Frames ({config.slots.length})</h3>
          <EditorButton type="button" variant="secondary" onClick={() => addSlot(null)}>
            <Plus className="size-4" aria-hidden /> Empty slot
          </EditorButton>
        </div>
        <ul className="flex flex-col gap-2">
          {config.slots.map((slot, index) => {
            const frame = frames.find((entry) => entry.id === slot.frameId)
            const busy = frame?.inCanvas && frame.inCanvas.canvasId !== layout.id
            return (
              <li key={slot.id} className="rounded-lg border border-border bg-card p-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs text-primary">{index + 1}</span>
                  <select
                    aria-label={`Frame for slot ${index + 1}`}
                    value={slot.frameId ?? ''}
                    onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, frameId: e.target.value || null }))}
                    className="editor-control h-9 min-w-0 flex-1 px-2"
                  >
                    <option value="">Empty slot</option>
                    {frames.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}{entry.inCanvas ? ` (${entry.inCanvas.state} on ${entry.inCanvas.name})` : ''}
                      </option>
                    ))}
                  </select>
                  <EditorButton type="button" variant="destructive" aria-label={`Remove slot ${index + 1}`} onClick={() => updateConfig({ ...config, slots: config.slots.filter((s) => s.id !== slot.id) })}>
                    <Trash2 className="size-4" aria-hidden />
                  </EditorButton>
                </div>
                {busy && <p className="mt-1 text-[11px] text-amber-700">Already used by another canvas.</p>}
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Offset X
                    <input type="number" aria-label={`Offset X slot ${index + 1}`} value={slot.offset.x} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, offset: { ...s.offset, x: Number(e.target.value) } }))} className="editor-control h-8 px-1" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Offset Y
                    <input type="number" aria-label={`Offset Y slot ${index + 1}`} value={slot.offset.y} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, offset: { ...s.offset, y: Number(e.target.value) } }))} className="editor-control h-8 px-1" />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    Scale
                    <input type="number" aria-label={`Scale slot ${index + 1}`} min={0.25} max={2} step={0.05} value={slot.scale} onChange={(e) => updateSlot(slot.id, (s) => ({ ...s, scale: Math.max(0.25, Math.min(2, Number(e.target.value))) }))} className="editor-control h-8 px-1" />
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <SelectField
        label="Canvas album"
        value={layout.settings.albumId ?? ''}
        options={[{ value: '', label: 'None' }, ...canvasAlbums.map((entry) => ({ value: entry.id, label: entry.name }))]}
        onChange={(v) => onChange({ ...layout, settings: { ...layout.settings, albumId: v || null } })}
      />

      <section aria-label="Display options" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
        <h3 className="text-sm font-semibold">Display options</h3>
        <SelectField label="Markers" value={config.markers} options={[
          { value: 'identify', label: 'During identification' },
          { value: 'always', label: 'Always' },
          { value: 'never', label: 'Never' },
        ]} onChange={(v) => updateConfig({ ...config, markers: v as CanvasConfig['markers'] })} />
        <SelectField label="Notifications" value={config.notifications} options={[
          { value: 'suppress', label: 'Suppress' },
          { value: 'show', label: 'Show' },
        ]} onChange={(v) => updateConfig({ ...config, notifications: v as CanvasConfig['notifications'] })} />
        <SelectField label="Night mode" value={config.nightMode} options={[
          { value: 'inherit', label: 'Inherit from frame' },
          { value: 'ignore', label: 'Ignore' },
        ]} onChange={(v) => updateConfig({ ...config, nightMode: v as CanvasConfig['nightMode'] })} />
        <SelectField label="Max FPS" value={String(config.maxFps)} options={['15', '24', '30', '60'].map((value) => ({ value, label: `${value} fps` }))} onChange={(v) => updateConfig({ ...config, maxFps: Number(v) as CanvasConfig['maxFps'] })} />
      </section>

      <section aria-label="Preview" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
        <h3 className="text-sm font-semibold">Wall preview</h3>
        <WallPreview layout={layout} album={album ? {
          id: album.id,
          name: album.name,
          scenes: album.scenes ?? [],
          order: album.slideshow.order,
          crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? 400,
        } : null} />
      </section>

      <section aria-label="Problems" className="rounded-lg border border-border bg-card p-2">
        <h3 className="mb-1 text-sm font-semibold">Problems</h3>
        {issues.length === 0 && config.slots.every((slot) => slot.frameId) && layout.settings.albumId ? (
          <p className="text-xs text-muted-foreground">Ready to deploy.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-amber-700">
            {issues.map((issue) => <li key={issue.code + (issue.slotIds?.join(',') ?? '')}>{issue.message}</li>)}
            {config.slots.some((slot) => !slot.frameId) && <li>Assign every slot before deploying.</li>}
            {!layout.settings.albumId && <li>Choose a canvas album.</li>}
          </ul>
        )}
      </section>
    </div>
  )
}
