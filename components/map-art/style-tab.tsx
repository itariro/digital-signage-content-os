'use client'

import type { MapArtSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

export type StyleOption = {
  id: MapArtSettings['styleId']
  label: string
  swatches: string[]
}

const zoomLevels = [
  { value: 10, label: 'City', description: 'Whole city context' },
  { value: 12, label: 'District', description: 'Neighbourhood clusters' },
  { value: 14, label: 'Neighbourhood', description: 'Street-level detail' },
  { value: 16, label: 'Detail', description: 'Closest streets and blocks' },
] as const

export function StyleTab({
  values, styles, presets,
  onStyleChange, onOrientationChange, onBackgroundChange, onZoomChange, onZoomPreset,
  onStreetLabelsChange, onTitleChange, onCoordsChange, onRailwaysChange, onTrailsChange,
  onCustomTextChange,
}: {
  values: Pick<
    MapArtSettings,
    'styleId' | 'orientation' | 'backgroundColor' | 'zoom' | 'streetLabels' |
    'title' | 'showCoords' | 'showRailways' | 'showTrails' | 'customText'
  >
  styles: readonly StyleOption[]
  presets: string[]
  onStyleChange: (style: StyleOption) => void
  onOrientationChange: (orientation: MapArtSettings['orientation']) => void
  onBackgroundChange: (color: string) => void
  onZoomChange: (zoom: number) => void
  onZoomPreset: (zoom: number) => void
  onStreetLabelsChange: (value: MapArtSettings['streetLabels']) => void
  onTitleChange: (value: boolean) => void
  onCoordsChange: (value: boolean) => void
  onRailwaysChange: (value: boolean) => void
  onTrailsChange: (value: boolean) => void
  onCustomTextChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <FieldSet className="gap-3">
        <FieldLegend>Map style</FieldLegend>
        <div className="map-art-presets">
          {presets.map((preset, index) => {
            const option = styles[index % styles.length]
            const active = values.styleId === option.id
            return (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'outline'}
                className={`h-auto flex-col items-stretch whitespace-normal ${active ? 'active' : ''}`}
                onClick={() => onStyleChange(option)}
                aria-pressed={active}
              >
                <span className={`map-art-swatch swatch-${option.id}`}><i /><i /><i /></span>
                <span>{preset}</span>
              </Button>
            )
          })}
        </div>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Poster</FieldLegend>
        <div className="map-art-segment">
          <Button type="button" size="sm" variant={values.orientation === 'portrait' ? 'secondary' : 'ghost'} aria-pressed={values.orientation === 'portrait'} onClick={() => onOrientationChange('portrait')}>Portrait</Button>
          <Button type="button" size="sm" variant={values.orientation === 'landscape' ? 'secondary' : 'ghost'} aria-pressed={values.orientation === 'landscape'} onClick={() => onOrientationChange('landscape')}>Landscape</Button>
        </div>
        <div className="map-art-resolution">
          {values.orientation === 'portrait' ? '11 MP · 2880 × 3840' : '8 MP · 3840 × 2160'} <span>PNG</span>
        </div>
        <Field className="gap-1">
          <FieldLabel className="map-art-label" htmlFor="poster-background">Poster background</FieldLabel>
          <div className="map-art-color-picker">
            <Input id="poster-background" type="color" className="map-art-color-input" value={values.backgroundColor} onChange={(event) => onBackgroundChange(event.target.value)} />
            <Input className="map-art-input" aria-label="Background hex color" value={values.backgroundColor} onChange={(event) => {
              if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onBackgroundChange(event.target.value)
            }} />
          </div>
        </Field>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Zoom level</FieldLegend>
        <Field className="gap-1">
          <div className="flex items-center justify-between">
            <FieldLabel className="map-art-label" htmlFor="map-zoom">Map zoom</FieldLabel>
            <span className="map-art-label-count">{values.zoom.toFixed(1)}</span>
          </div>
          <Slider
            id="map-zoom"
            aria-label="Map zoom"
            value={values.zoom}
            min={8}
            max={16}
            step={0.1}
            onValueChange={(next) => onZoomChange(next as number)}
          />
        </Field>
        <div role="radiogroup" aria-label="Zoom level" className="map-art-zoom-presets">
          {zoomLevels.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              role="radio"
              size="sm"
              variant={Math.abs(values.zoom - preset.value) < 0.1 ? 'secondary' : 'outline'}
              aria-checked={Math.abs(values.zoom - preset.value) < 0.1}
              title={preset.description}
              onClick={() => onZoomPreset(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </FieldSet>

      <FieldSet className="gap-3">
        <FieldLegend>Labels and layers</FieldLegend>
        <Field className="gap-1">
          <FieldLabel className="map-art-label" htmlFor="street-label-density">Street names</FieldLabel>
          <Select
            items={[
              { value: 'major', label: 'Major streets' },
              { value: 'all', label: 'All street names' },
              { value: 'none', label: 'Hide street names' },
            ]}
            value={values.streetLabels}
            onValueChange={(next) => next !== null && onStreetLabelsChange(String(next) as MapArtSettings['streetLabels'])}
          >
            <SelectTrigger id="street-label-density" className="map-art-input w-full"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="major">Major streets</SelectItem>
                <SelectItem value="all">All street names</SelectItem>
                <SelectItem value="none">Hide street names</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <div className="map-art-layer-toggle">
          <Switch id="map-layer-railways" checked={values.showRailways} onCheckedChange={onRailwaysChange} />
          <FieldLabel htmlFor="map-layer-railways" className="font-normal">Railway lines</FieldLabel>
        </div>
        <div className="map-art-layer-toggle">
          <Switch id="map-layer-trails" checked={values.showTrails} onCheckedChange={onTrailsChange} />
          <FieldLabel htmlFor="map-layer-trails" className="font-normal">Trails &amp; paths</FieldLabel>
        </div>
        <div className="map-art-checks flex flex-col gap-3">
          <div>
            <Checkbox id="poster-title" checked={values.title} onCheckedChange={(checked) => onTitleChange(checked === true)} />
            <FieldLabel htmlFor="poster-title" className="font-normal">City title</FieldLabel>
          </div>
          <div>
            <Checkbox id="poster-coordinates" checked={values.showCoords} onCheckedChange={(checked) => onCoordsChange(checked === true)} />
            <FieldLabel htmlFor="poster-coordinates" className="font-normal">Coordinates</FieldLabel>
          </div>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="poster-note">Custom subtitle</FieldLabel>
            <Input
              id="poster-note"
              className="map-art-input"
              maxLength={60}
              value={values.customText}
              onBlur={() => onCustomTextChange(values.customText)}
              onChange={(event) => onCustomTextChange(event.target.value)}
              placeholder="Optional text"
            />
          </Field>
        </div>
      </FieldSet>
    </div>
  )
}
