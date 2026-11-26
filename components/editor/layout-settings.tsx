'use client'

import { useRef, useState } from 'react'
import { ImageOff, ImagePlus, Loader2, MapPin, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { EditorApi } from '@/hooks/use-editor'
import { useGeocode } from '@/hooks/use-frame-store'
import { downscaleImage } from '@/lib/frame-utils'
import type { Album } from '@/lib/types'
import { THEME_META } from '@/lib/albums'
import { Section, Segmented, SelectField, SliderField, ThemeSwatches, ToggleField } from './controls'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

const BACKGROUNDS = [
  { src: '/backgrounds/alpine-lake.png', label: 'Alpine lake' },
  { src: '/backgrounds/coastal-cliffs.png', label: 'Coastal cliffs' },
  { src: '/backgrounds/city-night.png', label: 'City at dusk' },
  { src: '/backgrounds/desert-dunes.png', label: 'Desert dunes' },
]

export function LayoutSettingsPanel({
  editor,
  albums,
  onOpenAlbums,
}: {
  editor: EditorApi
  albums: Album[]
  onOpenAlbums: () => void
}) {
  const { settings } = editor.state
  const activeAlbum = albums.find((a) => a.id === settings.albumId) ?? null
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
    <div className="editor-panel flex min-h-0 flex-col">
      <div className="editor-panel-heading flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">Layout settings</p>
        <p className="text-xs text-muted-foreground">Select a widget on the canvas to edit its style.</p>
      </div>

      <Section title="Frame">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">Panel</span>
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

      <Section
        title="Slideshow"
        action={
          <Button type="button" variant="link" size="sm" onClick={onOpenAlbums} className="h-auto p-0 text-xs">
            Manage albums
          </Button>
        }
      >
        <SelectField
          label="Album"
          value={activeAlbum?.id ?? ''}
          onChange={(id) => editor.updateSettings({ albumId: id || null })}
          options={[{ value: '', label: 'None — use photo library' }, ...albums.map((a) => ({ value: a.id, label: a.name }))]}
        />
        {activeAlbum ? (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {activeAlbum.items.length} {THEME_META[activeAlbum.theme].label.toLowerCase()} · new slide every {activeAlbum.slideshow.interval}s.
              Add a Now showing widget to caption each slide.
            </p>
            <SliderField
              label="Dim slideshow"
              value={settings.dim}
              min={0}
              max={80}
              suffix="%"
              onCommit={() => editor.checkpoint()}
              onChange={(dim) => editor.updateSettings({ dim }, false)}
            />
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pick an album to cycle movie posters, book covers, album art, map posters or photos behind this layout.
          </p>
        )}
      </Section>

      {!activeAlbum && <Section title="Preview photo">
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map((bg) => (
            <Button
              key={bg.src}
              type="button"
              variant="ghost"
              aria-pressed={settings.background === bg.src}
              aria-label={bg.label}
              onClick={() => editor.updateSettings({ background: bg.src })}
              className={cn(
                'aspect-[9/16] h-auto overflow-hidden rounded-md bg-cover bg-center p-0 ring-1 transition hover:bg-transparent',
                settings.background === bg.src ? 'ring-2 ring-primary' : 'ring-border hover:ring-muted-foreground',
              )}
              style={{ backgroundImage: `url(${bg.src})` }}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
            aria-pressed={isCustomBg}
            className={cn(
              'flex aspect-[9/16] h-auto flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-secondary bg-cover bg-center p-0 text-xs text-muted-foreground ring-1 transition hover:bg-secondary hover:text-foreground',
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
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => editor.updateSettings({ background: '' })}
            aria-pressed={settings.background === ''}
            className={cn(
              'flex aspect-[9/16] h-auto flex-col items-center justify-center gap-1 rounded-md bg-muted p-0 text-xs text-muted-foreground ring-1 transition hover:bg-muted hover:text-foreground',
              settings.background === '' ? 'ring-2 ring-primary' : 'ring-border',
            )}
          >
            <ImageOff className="size-4" aria-hidden />
            None
          </Button>
        </div>
        <Input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
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
      </Section>}

      <Section title="Weather location">
        <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-foreground">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{settings.locationName}</span>
        </div>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a city"
            aria-label="Search a city"
          />
          {isLoading && (
            <InputGroupAddon align="inline-end">
              <Loader2 className="animate-spin" aria-hidden />
            </InputGroupAddon>
          )}
        </InputGroup>
        {query.trim().length >= 2 && results.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-md border border-border">
            {results.map((r) => (
              <li key={r.id}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    editor.updateSettings({ locationName: r.name, lat: r.lat, lon: r.lon })
                    setQuery('')
                  }}
                  className="w-full justify-start truncate rounded-none px-3 py-2 text-left text-sm font-normal"
                >
                  {r.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-foreground">Units</span>
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
