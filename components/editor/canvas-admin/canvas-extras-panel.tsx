'use client'

import { useState } from 'react'
import type { FrameScreenSize } from '@/lib/canvas/geometry'
import type { CanvasConfig } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  config: CanvasConfig
  frames: FrameScreenSize[]
  onChange: (config: CanvasConfig) => void
}

const BEZEL_OPTIONS = [
  { value: 'show', label: 'Show gap' },
  { value: 'hide', label: 'Hide gap' },
  { value: 'collapse', label: 'Collapse gap' },
]

const UNIT_OPTIONS = [
  { value: 'pixels', label: 'Canvas pixels' },
  { value: 'physical', label: 'Millimetres' },
]

const ROTATION_OPTIONS = ['0', '90', '180', '270'].map((value) => ({ value, label: `${value}°` }))

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
      <Field className="gap-1">
        <FieldLabel htmlFor="canvas-bezel-mode">Bezel mode</FieldLabel>
        <Select
          items={BEZEL_OPTIONS}
          value={config.bezelMode ?? 'show'}
          onValueChange={(next) => next !== null && patch({ bezelMode: String(next) as CanvasConfig['bezelMode'] })}
        >
          <SelectTrigger id="canvas-bezel-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {BEZEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field className="gap-1">
        <FieldLabel htmlFor="canvas-gap-units">Gap units</FieldLabel>
        <Select
          items={UNIT_OPTIONS}
          value={config.unitMode ?? 'pixels'}
          onValueChange={(next) => next !== null && patch({ unitMode: String(next) as CanvasConfig['unitMode'] })}
        >
          <SelectTrigger id="canvas-gap-units" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {UNIT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field className="gap-1">
          <FieldLabel htmlFor="canvas-screen-width">Screen width (mm)</FieldLabel>
          <Input
            id="canvas-screen-width"
            type="number"
            min={1}
            value={config.screenWidthMm ?? ''}
            onChange={(event) => patch({ screenWidthMm: Number(event.target.value) || undefined })}
          />
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="canvas-screen-height">Screen height (mm)</FieldLabel>
          <Input
            id="canvas-screen-height"
            type="number"
            min={1}
            value={config.screenHeightMm ?? ''}
            onChange={(event) => patch({ screenHeightMm: Number(event.target.value) || undefined })}
          />
        </Field>
      </div>

      {frames.map((frame, index) => (
        <Field key={frame.id} className="gap-1">
          <FieldLabel htmlFor={`canvas-rotation-${frame.id}`}>{`Rotation for slot ${index + 1}`}</FieldLabel>
          <Select
            items={ROTATION_OPTIONS}
            value={String(config.slots[index]?.rotation ?? 0)}
            onValueChange={(next) => {
              if (next === null) return
              const rotation = Number(next) as 0 | 90 | 180 | 270
              const slots = config.slots.map((slot, slotIndex) => slotIndex === index ? { ...slot, rotation } : slot)
              patch({ slots })
            }}
          >
            <SelectTrigger id={`canvas-rotation-${frame.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {ROTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ))}

      <Field className="gap-1">
        <FieldLabel htmlFor="canvas-gallery-image">Upload gallery image</FieldLabel>
        <Input
          id="canvas-gallery-image"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </Field>
      <output aria-live="polite" className="block">
        {assetRef ? (
          <Badge variant="secondary" className="max-w-full truncate font-mono text-[11px]">{assetRef}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Refs start with canvas-asset:</span>
        )}
      </output>
    </section>
  )
}
