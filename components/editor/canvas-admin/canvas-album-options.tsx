'use client'

import type { CanvasAlbum, CanvasLayer, CanvasScene } from '@/lib/types'
import { CANVAS_TRANSITION_KINDS } from '@/lib/types'
import { CANVAS_PALETTES } from '@/lib/canvas/palettes'
import { syncCanvasAlbumLayers } from '@/lib/canvas/composition'
import { DEFAULT_STYLE } from '@/lib/widgets'

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
    <section className="grid gap-4 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">Composition</h3>

      <label className="grid gap-1 text-sm">
        Palette
        <select
          className="input"
          value={album.paletteId ?? ''}
          onChange={(event) => update({ paletteId: event.target.value ? event.target.value as CanvasAlbum['paletteId'] : undefined })}
        >
          <option value="">Built-in defaults</option>
          {CANVAS_PALETTES.map((palette) => (
            <option key={palette.id} value={palette.id}>{palette.name}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <label className="grid gap-1">
          Transition
          <select
            className="input"
            value={transition.kind}
            onChange={(event) => update({ transition: { ...transition, kind: event.target.value as NonNullable<CanvasAlbum['transition']>['kind'] } })}
          >
            {CANVAS_TRANSITION_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          Duration (ms)
          <input
            className="input"
            type="number"
            min={0}
            max={10000}
            step={100}
            value={transition.durationMs}
            onChange={(event) => update({ transition: { ...transition, durationMs: Number(event.target.value) } })}
          />
        </label>
        <label className="grid gap-1">
          Direction
          <select
            className="input"
            value={transition.direction}
            onChange={(event) => update({ transition: { ...transition, direction: event.target.value as NonNullable<CanvasAlbum['transition']>['direction'] } })}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </label>
      </div>

      <h4 className="text-sm font-medium">Layers</h4>
      {layers.map((layer, index) => (
        <div key={layer.id} className="grid gap-2 rounded border border-border p-3 text-sm">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={layer.enabled}
              onChange={(event) => updateLayer(index, { enabled: event.target.checked })}
              aria-label={`Enable ${layer.name}`}
            />
            <input
              className="input"
              value={layer.name}
              onChange={(event) => updateLayer(index, { name: event.target.value })}
              aria-label={`Name of layer ${index + 1}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">{layer.scenes.length} scene(s), {layer.order}, {layer.crossfadeMs} ms fade</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('sync-test')] })}>
              Add sync test
            </button>
            <button type="button" className="button-secondary" onClick={() => updateLayer(index, { scenes: [...layer.scenes, newScene('marquee')] })}>
              Add marquee
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={layer.scenes.length === 0}
              onClick={() => updateLayer(index, { scenes: layer.scenes.slice(0, -1) })}
            >
              Remove last scene
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="button-secondary"
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
      </button>
    </section>
  )
}
