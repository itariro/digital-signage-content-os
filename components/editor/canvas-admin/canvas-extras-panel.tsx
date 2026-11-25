'use client'

import { useState } from 'react'
import type { FrameScreenSize } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'

type Props = {
  config: CanvasConfig
  frames: FrameScreenSize[]
  onChange: (config: CanvasConfig) => void
}

export function CanvasExtrasPanel({ config, frames, onChange }: Props) {
  const [assetRef, setAssetRef] = useState('')

  async function upload(file: File) {
    const form = new FormData()
    form.set('file', file)
    const response = await fetch('/api/canvas/assets', { method: 'POST', body: form })
    if (!response.ok) return
    const body = (await response.json()) as { ref: string }
    setAssetRef(body.ref)
  }

  function patch(next: Partial<CanvasConfig>) {
    onChange({ ...config, ...next })
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Canvas extras">
      <label className="flex flex-col gap-1">
        <span>Bezel mode</span>
        <select
          value={config.bezelMode ?? 'show'}
          onChange={(event) => patch({ bezelMode: event.target.value as CanvasConfig['bezelMode'] })}
        >
          <option value="show">Show gap</option>
          <option value="hide">Hide gap</option>
          <option value="collapse">Collapse gap</option>
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Gap units</span>
        <select
          value={config.unitMode ?? 'pixels'}
          onChange={(event) => patch({ unitMode: event.target.value as CanvasConfig['unitMode'] })}
        >
          <option value="pixels">Canvas pixels</option>
          <option value="physical">Millimetres</option>
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span>Screen width (mm)</span>
          <input
            type="number"
            min={1}
            value={config.screenWidthMm ?? ''}
            onChange={(event) => patch({ screenWidthMm: Number(event.target.value) || undefined })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Screen height (mm)</span>
          <input
            type="number"
            min={1}
            value={config.screenHeightMm ?? ''}
            onChange={(event) => patch({ screenHeightMm: Number(event.target.value) || undefined })}
          />
        </label>
      </div>

      {frames.map((frame, index) => (
        <label key={frame.id} className="flex flex-col gap-1">
          <span>{`Rotation for slot ${index + 1}`}</span>
          <select
            value={String(config.slots[index]?.rotation ?? 0)}
            onChange={(event) => {
              const rotation = Number(event.target.value) as 0 | 90 | 180 | 270
              const slots = config.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, rotation } : slot)
              patch({ slots })
            }}
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </select>
        </label>
      ))}

      <label className="flex flex-col gap-1">
        <span>Upload gallery image</span>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }} />
      </label>
      <output aria-live="polite">{assetRef || 'Refs start with canvas-asset:'}</output>
    </section>
  )
}
