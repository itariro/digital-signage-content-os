'use client'

import { useRef, useState } from 'react'
import { ImageOff, ImagePlus, Loader2, MapPin, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { EditorApi } from '@/hooks/use-editor'
import { useGeocode } from '@/hooks/use-frame-store'
import { downscaleImage } from '@/lib/frame-utils'
import { Section, Segmented, SliderField, ThemeSwatches, ToggleField } from './controls'
import { cn } from '@/lib/utils'

const BACKGROUNDS = [
  { src: '/backgrounds/alpine-lake.png', label: 'Alpine lake' },
  { src: '/backgrounds/coastal-cliffs.png', label: 'Coastal cliffs' },
  { src: '/backgrounds/city-night.png', label: 'City at dusk' },
  { src: '/backgrounds/desert-dunes.png', label: 'Desert dunes' },
]

export function LayoutSettingsPanel({ editor }: { editor: EditorApi }) {
  const { settings } = editor.state
  const fileRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const { results, isLoading } = useGeocode(query)
  const isCustomBg = settings.background.startsWith('data:')

  async function onUpload(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    try {
      const dataUrl = await downscaleImage(file)
      editor.updateSettings({ background: dataUrl })
      toast.success('Preview photo updated')
    } catch {
      toast.error('Could not read that image')
    }
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Layout settings</p>
        <p className="text-xs text-muted-foreground">Select a widget on the canvas to edit its style.</p>
      </div>

      <Section title="Frame">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Panel</span>
          <Segmented
            label="Frame resolution"
            value={settings.resolution}
            onChange={(resolution) => editor.updateSettings({ resolution })}
            className="w-44"
            options={[
              { value: '1080x1920', label: '1080p' },
              { value: '1440x2560', label: '1440p' },
            ]}
          />
        </div>
        <ToggleField label="Snap to grid" checked={settings.snap} onChange={(snap) => editor.updateSettings({ snap })} />
        {settings.snap && (
          <SliderField
            label="Grid size"
            value={settings.gridSize}
            min={8}
            max={80}
            step={4}
            suffix="px"
            onCommit={() => editor.checkpoint()}
            onChange={(gridSize) => editor.updateSettings({ gridSize }, false)}
          />
        )}
      </Section>

      {editor.state.widgets.length > 0 && (
        <Section title="Theme">
          <ThemeSwatches
            label="Restyle every widget"
            onApply={(style) => editor.updateStyle(editor.state.widgets.map((w) => w.id), style)}
          />
        </Section>
      )}

      <Section title="Preview photo">
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg.src}
              type="button"
              aria-pressed={settings.background === bg.src}
              aria-label={bg.label}
              onClick={() => editor.updateSettings({ background: bg.src })}
              className={cn(
                'aspect-[9/16] overflow-hidden rounded-md bg-cover bg-center ring-1 transition',
                settings.background === bg.src ? 'ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
              )}
              style={{ backgroundImage: `url(${bg.src})` }}
            />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-pressed={isCustomBg}
            className={cn(
              'flex aspect-[9/16] flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-secondary bg-cover bg-center text-xs text-muted-foreground ring-1 transition hover:text-foreground',
              isCustomBg ? 'ring-2 ring-primary' : 'ring-border',
            )}
            style={isCustomBg ? { backgroundImage: `url(${settings.background})` } : undefined}
          >
            {!isCustomBg && (
              <>
                <ImagePlus className="size-4" aria-hidden />
                Upload
              </>
            )}
            {isCustomBg && <span className="sr-only">Replace uploaded photo</span>}
          </button>
          <button
            type="button"
            onClick={() => editor.updateSettings({ background: '' })}
            aria-pressed={settings.background === ''}
            className={cn(
              'flex aspect-[9/16] flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground ring-1 transition hover:text-foreground',
              settings.background === '' ? 'ring-2 ring-primary' : 'ring-border',
            )}
          >
            <ImageOff className="size-4" aria-hidden />
            None
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
        <SliderField
          label="Dim photo"
          value={settings.dim}
          min={0}
          max={80}
          suffix="%"
          onCommit={() => editor.checkpoint()}
          onChange={(dim) => editor.updateSettings({ dim }, false)}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          The frame rotates through your photo library — this photo is only used to preview contrast.
        </p>
      </Section>

      <Section title="Weather location">
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{settings.locationName}</span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a city"
            aria-label="Search a city"
            className="h-9 w-full rounded-md border border-border bg-transparent pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary"
          />
          {isLoading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
        </div>
        {query.trim().length >= 2 && results.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-md border border-border">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    editor.updateSettings({ locationName: r.name, lat: r.lat, lon: r.lon })
                    setQuery('')
                  }}
                  className="w-full truncate px-3 py-2 text-left text-sm text-foreground hover:bg-secondary"
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Units</span>
          <Segmented
            label="Temperature units"
            value={settings.units}
            onChange={(units) => editor.updateSettings({ units })}
            className="w-32"
            options={[
              { value: 'metric', label: '°C' },
              { value: 'imperial', label: '°F' },
            ]}
          />
        </div>
      </Section>
    </div>
  )
}
