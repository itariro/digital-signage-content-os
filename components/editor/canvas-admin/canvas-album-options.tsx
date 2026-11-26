'use client'

import type { CanvasAlbum, CanvasLayer, CanvasScene } from '@/lib/types'
import { CANVAS_TRANSITION_KINDS } from '@/lib/types'
import { CANVAS_PALETTES } from '@/lib/canvas/palettes'
import { syncCanvasAlbumLayers } from '@/lib/canvas/composition'
import { DEFAULT_STYLE } from '@/lib/widgets'
import { Section } from '@/components/editor/controls'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

const DIRECTION_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
]

const TRANSITION_OPTIONS = CANVAS_TRANSITION_KINDS.map((kind) => ({
  value: kind,
  label: kind.charAt(0).toUpperCase() + kind.slice(1),
}))

function newScene(type: 'sync-test' | 'marquee'): CanvasScene {
  if (type === 'sync-test') {
    return {
      id: `scene-${type}-${Date.now()}`,
      name: 'Sync test',
      enabled: true,
      durationSec: 30,
      seed: 1,
      type,
      config: { periodSec: 4, showGrid: true, showBezels: true },
    }
  }
  return {
    id: `scene-marquee-${Date.now()}`,
    name: 'Marquee',
    enabled: true,
    durationSec: 60,
    seed: 2,
    type: 'marquee',
    config: {
      lines: ['Type here'],
      layout: 'line',
      separator: '   •   ',
      direction: 'left',
      orientation: 'upright',
      speed: 240,
      repeat: true,
      gap: 600,
      lineHeight: 200,
      fontSize: 160,
      align: 'center',
      crossOffset: 0,
      style: { ...DEFAULT_STYLE, fontFamily: 'bebas', fontWeight: 700 },
    },
  }
}

export function CanvasAlbumOptions({
  album,
  onChange,
}: {
  album: CanvasAlbum
  onChange: (album: CanvasAlbum) => void
}) {
  const layers = album.layers?.length ? album.layers : [
    { id: 'base', name: 'Base', enabled: true, scenes: album.scenes, order: 'sequence', crossfadeMs: 400 } as CanvasLayer,
  ]
  const transition = album.transition ?? { kind: 'none' as const, durationMs: 0, direction: 'left' as const }

  const update = (patch: Partial<CanvasAlbum>) => {
    onChange(syncCanvasAlbumLayers({ ...album, ...patch }))
  }

  const updateLayer = (index: number, patch: Partial<CanvasLayer>) => {
    const next = layers.map((layer, position) => position === index ? { ...layer, ...patch } : layer)
    update({ layers: next })
  }

  return (
    <Section title="Composition" className="rounded-lg border border-border bg-card p-4">
      <Field className="gap-1">
        <FieldLabel htmlFor="canvas-album-palette">Palette</FieldLabel>
        <Select
          items={[{ value: 'none', label: 'Built-in defaults' }, ...CANVAS_PALETTES.map((palette) => ({ value: palette.id, label: palette.name }))]}
          value={album.paletteId ?? 'none'}
          onValueChange={(next) => next !== null && update({ paletteId: next === 'none' ? undefined : String(next) as CanvasAlbum['paletteId'] })}
        >
          <SelectTrigger id="canvas-album-palette" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              <SelectItem value="none">Built-in defaults</SelectItem>
              {CANVAS_PALETTES.map((palette) => (
                <SelectItem key={palette.id} value={palette.id}>{palette.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field className="gap-1">
          <FieldLabel htmlFor="canvas-transition">Transition</FieldLabel>
          <Select
            items={TRANSITION_OPTIONS}
            value={transition.kind}
            onValueChange={(next) => next !== null && update({ transition: { ...transition, kind: String(next) as NonNullable<CanvasAlbum['transition']>['kind'] } })}
          >
            <SelectTrigger id="canvas-transition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {TRANSITION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="canvas-transition-duration">Duration (ms)</FieldLabel>
          <Input
            id="canvas-transition-duration"
            type="number"
            min={0}
            max={10000}
            step={100}
            value={transition.durationMs}
            onChange={(event) => update({ transition: { ...transition, durationMs: Number(event.target.value) } })}
          />
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="canvas-transition-direction">Direction</FieldLabel>
          <Select
            items={DIRECTION_OPTIONS}
            value={transition.direction}
            onValueChange={(next) => next !== null && update({ transition: { ...transition, direction: String(next) as NonNullable<CanvasAlbum['transition']>['direction'] } })}
          >
            <SelectTrigger id="canvas-transition-direction" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <h4 className="text-sm font-medium">Layers</h4>
      {layers.map((layer, index) => (
        <div key={layer.id} className="grid gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={layer.enabled}
              onCheckedChange={(checked) => updateLayer(index, { enabled: checked === true })}
              aria-label={`Enable ${layer.name}`}
            />
            <Input
              value={layer.name}
              onChange={(event) => updateLayer(index, { name: event.target.value })}
              aria-label={`Name of layer ${index + 1}`}
              className="min-w-0 flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">{layer.scenes.length} scene(s), {layer.order}, {layer.crossfadeMs} ms fade</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('sync-test')] })}>
              Add sync test
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('marquee')] })}>
              Add marquee
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={layer.scenes.length === 0}
              onClick={() => updateLayer(index, { scenes: layer.scenes.slice(0, -1) })}
            >
              Remove last scene
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={layers.length >= 3}
        onClick={() => update({
          layers: [...layers, {
            id: `layer-${layers.length + 1}`,
            name: `Layer ${layers.length + 1}`,
            enabled: true,
            scenes: [newScene('sync-test')],
            order: 'sequence',
            crossfadeMs: 400,
          }],
        })}
      >
        Add layer
      </Button>
    </Section>
  )
}
